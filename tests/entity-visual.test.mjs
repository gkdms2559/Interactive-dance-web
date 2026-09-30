import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesireEntity } from '../src/entities/DesireEntity.ts'
import { BLACK_CONFIG } from '../src/pieces/black-core/config.ts'
import { MotionResponse } from '../src/modules/art/MotionResponse.ts'

// Record actual Canvas drawing commands so regressions in visible geometry,
// rather than just successful setState calls, fail the test.
function drawing(entity, width = 1200, height = 900) {
  const strokes = []
  const scales = []
  let coreCenter
  let start
  let end
  let matrix = [1, 0, 0, 1, 0, 0]
  const stack = []
  const transformed = ({ x, y }) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] })
  const context = {
    save() { stack.push([...matrix]) }, restore() { matrix = stack.pop() },
    translate(x, y) { matrix[4] += matrix[0] * x + matrix[2] * y; matrix[5] += matrix[1] * x + matrix[3] * y },
    rotate(angle) {
      const [a, b, c, d] = matrix, cos = Math.cos(angle), sin = Math.sin(angle)
      matrix[0] = a * cos + c * sin; matrix[1] = b * cos + d * sin
      matrix[2] = c * cos - a * sin; matrix[3] = d * cos - b * sin
    },
    scale(x, y) { scales.push([x, y]); matrix[0] *= x; matrix[1] *= x; matrix[2] *= y; matrix[3] *= y },
    createRadialGradient() { return { addColorStop() {} } },
    fillRect() {}, beginPath() {}, arc(x, y) { coreCenter = transformed({ x, y }) }, fill() {},
    moveTo(x, y) { start = { x, y } },
    lineTo(x, y) { end = { x, y } },
    stroke() { strokes.push({ start, end, canvasStart: transformed(start), canvasEnd: transformed(end), width: this.lineWidth, color: this.strokeStyle }) },
  }
  entity.draw(context, width, height)
  return {
    scales, coreCenter,
    fibers: Array.from({ length: BLACK_CONFIG.TENTACLE_COUNT }, (_, index) => {
      const segments = strokes.slice(index * 64 + 32, index * 64 + 64)
      return { canvasRoot: segments[0].canvasStart, root: segments[0].start, tip: segments.at(-1).end, middle: segments[15].end, canvasTip: segments.at(-1).canvasEnd }
    }),
  }
}

function settle(state) {
  const entity = new DesireEntity(state)
  for (let i = 0; i < 240; i++) entity.update(1 / 60)
  return entity
}
const radius = (point) => Math.hypot(point.x, point.y)

test('full opening doubles the drawn fiber radius without scaling the canvas or moving roots', () => {
  const idle = drawing(settle({ expansion: 0 }))
  const open = drawing(settle({ expansion: 1 }))
  assert.deepEqual(open.scales, idle.scales)
  const ratios = open.fibers.map((fiber, index) => {
    const base = idle.fibers[index]
    assert.deepEqual(fiber.root, base.root)
    const ratio = radius(fiber.tip) / radius(base.tip)
    assert.ok(ratio >= 1.8 && ratio <= 2.2, `fiber ${index}: ${ratio}`)
    // The middle unfolds by a different ratio from the endpoint.
    assert.ok(radius(fiber.middle) / radius(base.middle) < ratio - 0.05)
    return ratio
  })
  assert.ok(Math.max(...ratios) - Math.min(...ratios) > 0.1)
})

test('primary and secondary groups reach actual wrist pixels in desktop and small portrait viewports', () => {
  for (const [width, height] of [[1600, 900], [390, 844]]) {
    const viewport = { width, height }
    const target = { x: width * 0.92, y: height * 0.16 }
    const dx = target.x - width / 2, dy = target.y - height / 2
    const distance = Math.hypot(dx, dy)
    const entity = settle({})
    entity.setPoseInfluence({ viewport, head: { x: 0.7, y: -0.4 }, left: null,
      right: { x: dx / distance, y: dy / distance, target, distance, activity: 1, reachAmount: 1, speed: 0 } })
    for (let i = 0; i < 240; i++) entity.update(1 / 60)
    const output = drawing(entity, width, height)
    const actualDistance = Math.hypot(target.x - output.coreCenter.x, target.y - output.coreCenter.y)
    const core = entity.getCoreDiagnostics().position
    assert.ok(Math.hypot(core.x - output.coreCenter.x, core.y - output.coreCenter.y) < 0.001)
    for (const fiber of output.fibers) assert.ok(Math.hypot(fiber.canvasRoot.x - core.x, fiber.canvasRoot.y - core.y) < 2)
    const lengths = output.fibers.map(({ tip }) => radius(tip) * Math.min(1, Math.min(width, height) / 650))
    const primary = lengths.filter((length) => length / actualDistance >= 0.85)
    const secondary = lengths.filter((length) => length / actualDistance >= 0.5 && length / actualDistance < 0.8)
    assert.equal(primary.length, 2)
    assert.equal(secondary.length, 4)
    assert.ok(Math.max(...primary) / actualDistance < 1.01)
    const closest = output.fibers.map(({ canvasTip }) => Math.hypot(canvasTip.x - target.x, canvasTip.y - target.y))
    assert.ok(Math.min(...closest) < distance * 0.06)
    const debug = entity.getReachDiagnostics().right
    assert.ok(Math.abs(debug.primaryLength / actualDistance - 0.97) < 0.02)
  }
})

test('a new wrist target is followed within 300ms without changing the core scale', () => {
  const entity = settle({})
  const influence = { viewport: { width: 1200, height: 900 }, head: { x: 0, y: 0 }, left: null,
    right: { x: 1, y: 0, target: { x: 1100, y: 450 }, distance: 500, reachAmount: 1, activity: 1, speed: 0 } }
  entity.setPoseInfluence(influence)
  for (let i = 0; i < 18; i++) entity.update(1 / 60)
  drawing(entity)
  assert.ok(entity.getReachDiagnostics().right.primaryLength > entity.getReachDiagnostics().right.targetDistance * 0.9)
  assert.equal(entity.getCoreDiagnostics().state, 'REST', 'hands cannot steer the core')
  influence.right.target = { x: 1020, y: 120 }
  entity.setPoseInfluence(influence)
  for (let i = 0; i < 18; i++) entity.update(1 / 60)
  const moved = drawing(entity)
  assert.ok(Math.min(...moved.fibers.map(({ canvasTip }) => Math.hypot(canvasTip.x - 1020, canvasTip.y - 120))) < 70)
})

test('the reported expansion of 0.7 produces a clearly larger silhouette', () => {
  const idle = drawing(settle({ expansion: 0 }))
  const active = drawing(settle({ expansion: 0.7 }))
  const ratios = active.fibers.map((fiber, index) => radius(fiber.tip) / radius(idle.fibers[index].tip))
  assert.ok(Math.min(...ratios) > 1.5)
})

test('strong lateral direction opens matching fibers 10–25% further with a restrained opposite side', () => {
  const neutral = drawing(settle({ expansion: 1 }))
  for (const direction of [-1, 1]) {
    const directed = drawing(settle({ expansion: 1, motionDirection: { x: direction, y: 0 } }))
    let checked = 0
    directed.fibers.forEach((fiber, index) => {
      const base = neutral.fibers[index]
      const facing = fiber.root.x / radius(fiber.root) * direction
      const ratio = radius(fiber.tip) / radius(base.tip)
      if (facing > 0.85) {
        assert.ok(ratio >= 1.1 && ratio <= 1.25, `${direction}: ${ratio}`)
        checked++
      } else if (facing < -0.85) assert.ok(ratio > 0.96 && ratio < 1.04)
    })
    assert.ok(checked > 0)
  }
})

test('input-to-render response becomes clear within 0.8s and settles over 2–4s', () => {
  const response = new MotionResponse()
  const entity = new DesireEntity()
  const advance = (seconds, intensity) => {
    for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
      response.receive({ intensity, direction: { x: 0, y: 0 }, regions: [0, 0, 0] })
      entity.setState(response.update(1 / 60))
      entity.update(1 / 60)
    }
    return entity.getState().expansion
  }
  assert.ok(advance(1 / 60, 1) < 0.015, 'no first-frame pop')
  assert.ok(advance(0.3, 1) > 0.4)
  assert.ok(advance(0.5, 1) > 0.82)
  const peak = advance(3, 1)
  assert.ok(advance(0.2, 0) > peak * 0.95, 'linger after movement stops')
  const halfway = advance(1.8, 0)
  assert.ok(halfway > peak * 0.08 && halfway < peak * 0.25)
  assert.ok(advance(2, 0) < peak * 0.025)
})

test('two hands simultaneously extend separate fiber groups while unrelated fibers stay small', () => {
  const idleEntity = settle({})
  const activeEntity = settle({})
  activeEntity.setPoseInfluence({
    viewport: { width: 1200, height: 900 },
    left: { x: -1, y: 0, distance: 500, target: { x: 100, y: 450 }, reachAmount: 1, activity: 1, speed: 0 },
    right: { x: 1, y: 0, distance: 500, target: { x: 1100, y: 450 }, reachAmount: 1, activity: 1, speed: 0 },
    head: { x: 0, y: 0 },
  })
  for (let i = 0; i < 240; i++) { idleEntity.update(1 / 60); activeEntity.update(1 / 60) }
  const idle = drawing(idleEntity)
  const active = drawing(activeEntity)
  let left = 0
  let right = 0
  let vertical = 0
  active.fibers.forEach((fiber, i) => {
    const cos = fiber.root.x / radius(fiber.root)
    const ratio = radius(fiber.tip) / radius(idle.fibers[i].tip)
    const sideDistance = activeEntity.getReachDiagnostics()[cos > 0 ? 'right' : 'left'].targetDistance
    if (radius(fiber.tip) > sideDistance * 0.85) {
      assert.ok(ratio > 1.8)
      if (cos > 0) right++; else left++
    } else if (Math.abs(cos) < 0.25) { assert.ok(ratio < 1.05); vertical++ }
  })
  assert.equal(left, 2)
  assert.equal(right, 2)
  assert.ok(vertical > 0)
  assert.deepEqual(active.scales[0], idle.scales[0])
  assert.ok(Math.abs(active.scales[1][1] - idle.scales[1][1]) < 0.03)
})

test('a distant off-axis hand lengthens and bends fibers toward it, then releases them', () => {
  const neutral = settle({})
  const near = settle({})
  const far = settle({})
  const direction = { x: Math.cos(0.4), y: Math.sin(0.4) }
  const input = (reachAmount) => ({
    viewport: { width: 1200, height: 900 },
    left: { ...direction, distance: 500, target: { x: 600 + direction.x * 500, y: 450 + direction.y * 500 }, reachAmount, activity: 1, speed: 0 },
    right: null, head: { x: 0, y: 0 },
  })
  near.setPoseInfluence(input(0.15))
  far.setPoseInfluence(input(1))
  for (let i = 0; i < 24; i++) for (const entity of [neutral, near, far]) entity.update(1 / 60)
  const a = drawing(neutral), b = drawing(near), c = drawing(far)
  let checked = 0
  c.fibers.forEach((fiber, i) => {
    if (radius(fiber.tip) > 500 * .85) {
      assert.ok(radius(fiber.tip) > radius(b.fibers[i].tip) * 1.2)
      const oldError = Math.abs(Math.atan2(a.fibers[i].tip.y, a.fibers[i].tip.x) - 0.4)
      const newError = Math.abs(Math.atan2(fiber.tip.y, fiber.tip.x) - 0.4)
      if (newError < oldError) checked++
    }
  })
  assert.ok(checked >= 2)
  far.setPoseInfluence({ viewport: { width: 1200, height: 900 }, left: null, right: null, head: { x: 0, y: 0 } })
  for (let i = 0; i < 300; i++) { far.update(1 / 60); neutral.update(1 / 60) }
  const released = drawing(far), idle = drawing(neutral)
  released.fibers.forEach((fiber, i) => assert.ok(Math.abs(radius(fiber.tip) / radius(idle.fibers[i].tip) - 1) < 0.01))
})
