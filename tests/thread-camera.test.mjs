import assert from 'node:assert/strict'
import { test } from 'node:test'
import { palmCenter, coverPoint } from '../src/pieces/thread-camera/coordinates.ts'
import { PalmTracker } from '../src/pieces/thread-camera/PalmTracker.ts'
import { DustSystem } from '../src/pieces/thread-camera/DustSystem.ts'
import { drawThread } from '../src/pieces/thread-camera/ThreadRenderer.ts'
import { THREAD_CONFIG as C } from '../src/pieces/thread-camera/config.ts'

const hand = (side, x, y = 0.5) => ({ side, confidence: 0.95, points: Array.from({ length: 21 }, () => ({ x, y })) })
const frame = (hands, time) => ({ hands, timestamp: time * 1000, epoch: 1, width: 1280, height: 720 })

test('palm endpoint lies inside wrist-to-MCP region, not at wrist or fingertips', () => {
  const points = Array.from({ length: 21 }, () => ({ x: 0.8, y: 0.1 }))
  points[0] = { x: 0.5, y: 0.8 }
  for (const i of [5, 9, 13, 17]) points[i] = { x: 0.5, y: 0.4 }
  assert.ok(Math.abs(palmCenter(points).y - 0.6) < 1e-9)
  assert.equal(palmCenter(points).x, 0.5)
  points[9].x = NaN
  assert.equal(palmCenter(points), null)
})

test('cover crop and selfie mapping agree across portrait, landscape and mirror toggle', () => {
  for (const [vw, vh, w, h] of [[1280, 720, 390, 844], [640, 480, 1920, 1080], [1280, 720, 1280, 720]]) {
    const scale = Math.max(w / vw, h / vh)
    for (const rawX of [0, 0.25, 0.5, 0.9, 1]) {
      const result = coverPoint({ x: 1 - rawX, y: 0.3 }, vw, vh, w, h)
      const originalPixelX = rawX * vw * scale + (w - vw * scale) / 2
      assert.ok(Math.abs(result.x - (w - originalPixelX)) < 1e-8)
      assert.ok(Math.abs(result.y - (0.3 * vh * scale + (h - vh * scale) / 2)) < 1e-8)
      assert.ok(Math.abs(coverPoint({ x: 1 - rawX, y: 0.3 }, vw, vh, w, h, false).x - originalPixelX) < 1e-8)
    }
  }
})

test('large hand movements are immediate, preserve identity through crossings, and allow zero length', () => {
  const tracker = new PalmTracker()
  tracker.receive(frame([hand('Left', 0.2), hand('Right', 0.8)], 0), 0, 1280, 720)
  tracker.update(0.05, 0.05, 1280, 720)
  tracker.receive(frame([hand('Right', 0.1), hand('Left', 0.9)], 0.1), 0.1, 1280, 720)
  let state = tracker.update(0.016, 0.116, 1280, 720)
  assert.ok(Math.abs(state.left.x - 1152) < 1e-8); assert.ok(Math.abs(state.right.x - 128) < 1e-8)
  tracker.receive(frame([hand('Left', 0.5), hand('Right', 0.5)], 0.2), 0.2, 1280, 720)
  state = tracker.update(0.016, 0.216, 1280, 720)
  assert.equal(state.left.x, state.right.x)
  const resized = tracker.update(0.016, 0.232, 390, 844)
  assert.equal(resized.left.x, 195)
})

test('brief single-hand loss holds its endpoint, prolonged loss fades, reacquisition is fast', () => {
  const tracker = new PalmTracker()
  tracker.receive(frame([hand('Left', 0.2), hand('Right', 0.8)], 0), 0, 1280, 720)
  for (let i = 1; i <= 10; i++) tracker.update(0.016, i * 0.016, 1280, 720)
  tracker.receive(frame([hand('Left', 0.21)], 0.18), 0.18, 1280, 720)
  assert.ok(tracker.update(0.016, 0.20, 1280, 720).alpha > 0.95)
  let state
  for (let i = 1; i <= 40; i++) state = tracker.update(0.016, 0.2 + i * 0.016, 1280, 720)
  assert.ok(state.alpha < 0.1)
  tracker.receive(frame([hand('Left', 0.3), hand('Right', 0.7)], 0.9), 0.9, 1280, 720)
  for (let i = 1; i <= 8; i++) state = tracker.update(0.016, 0.9 + i * 0.016, 1280, 720)
  assert.ok(state.alpha > 0.9)
  state = tracker.update(0.016, 3, 1280, 720)
  assert.equal(state.left, null); assert.equal(state.right, null)
})

test('small jitter is softened; one brief mislabeled hand does not jump to the opposite endpoint', () => {
  const tracker = new PalmTracker()
  tracker.receive(frame([hand('Left', 0.2), hand('Right', 0.8)], 0), 0, 1280, 720)
  tracker.receive(frame([hand('Right', 0.201)], 0.03), 0.03, 1280, 720)
  const state = tracker.update(0.016, 0.04, 1280, 720)
  assert.ok(state.left.x > 256 && state.left.x < 257.28)
  assert.equal(state.right.x, 1024)
})

test('thread uses one straight path with 8px orchid body and no endpoint markers', () => {
  const paths = [], strokes = []
  const context = { save() {}, restore() {}, beginPath() { paths.push([]) }, moveTo(x, y) { paths.at(-1).push([x, y]) },
    lineTo(x, y) { paths.at(-1).push([x, y]) }, stroke() { strokes.push([this.strokeStyle, this.lineWidth]) } }
  drawThread(context, { left: { x: 20, y: 30 }, right: { x: 410, y: 290 }, alpha: 1, speed: 0 })
  assert.deepEqual(paths, [[[20, 30], [410, 290]]])
  assert.deepEqual(strokes.at(-1), ['#C96BCF', 8])
})

test('dust remains bounded, finite at zero-length thread, and expires completely after loss', () => {
  const dust = new DustSystem(() => 0.5)
  const thread = { left: { x: 50, y: 300 }, right: { x: 1100, y: 300 }, alpha: 1, speed: 900 }
  for (let i = 0; i < 10000; i++) dust.update(0.016, thread)
  assert.ok(dust.count > 0 && dust.count <= C.PARTICLE_MAX_COUNT)
  thread.right = thread.left
  for (let i = 0; i < 300; i++) dust.update(0.016, thread)
  assert.equal(dust.count, 0)
  thread.right = { x: 900, y: 100 }
  for (let i = 0; i < 100; i++) dust.update(0.016, thread)
  for (let i = 0; i < 300; i++) dust.update(0.016, { left: null, right: null, alpha: 0, speed: 0 })
  assert.equal(dust.count, 0)
})
