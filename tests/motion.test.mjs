import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FrameDifference, quietMotion } from '../src/modules/webcam/FrameDifference.ts'
import { MotionResponse } from '../src/modules/art/MotionResponse.ts'
import { DesireEntity } from '../src/entities/DesireEntity.ts'

const WIDTH = 96
const HEIGHT = 72
function frame(pixel = () => 70) {
  const result = new Uint8ClampedArray(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const offset = (y * WIDTH + x) * 4
      result.fill(pixel(x, y), offset, offset + 3)
      result[offset + 3] = 255
    }
  }
  return result
}

test('first, unchanged, low-noise and uniform exposure frames stay quiet', () => {
  const detector = new FrameDifference(WIDTH, HEIGHT)
  assert.equal(detector.analyze(frame()).intensity, 0)
  assert.equal(detector.analyze(frame()).intensity, 0)
  assert.equal(detector.analyze(frame((x, y) => 70 + (x + y) % 7)).intensity, 0)
  assert.equal(detector.analyze(frame((x, y) => 100 + (x + y) % 7)).intensity, 0)
  detector.reset()
  assert.equal(detector.analyze(frame(() => 230)).intensity, 0)
})

test('localized movement reports mirrored region and vertical location', () => {
  const detector = new FrameDifference(WIDTH, HEIGHT)
  detector.analyze(frame())
  const motion = detector.analyze(frame((x, y) => x < 18 && y < 30 ? 180 : 70))
  assert.ok(motion.intensity > 0.3 && motion.intensity < 1)
  assert.ok(motion.direction.x > 0.9)
  assert.ok(motion.direction.y < -0.4)
  assert.ok(motion.regions[2] > motion.regions[0])
  assert.equal(detector.analyze(frame((x, y) => x < 18 && y < 30 ? 180 : 70)).intensity, 0)
})

test('larger moving areas yield stronger activity and balanced movement has no lateral bias', () => {
  const measure = (size) => {
    const detector = new FrameDifference(WIDTH, HEIGHT)
    detector.analyze(frame())
    return detector.analyze(frame((x, y) => x < size && y < 30 ? 180 : 70)).intensity
  }
  assert.ok(measure(22) > measure(8))
  const detector = new FrameDifference(WIDTH, HEIGHT)
  detector.analyze(frame())
  const motion = detector.analyze(frame((x, y) => (x < 10 || x >= 86) && y < 30 ? 180 : 70))
  assert.ok(motion.intensity > 0)
  assert.ok(Math.abs(motion.direction.x) < 0.01)
})

function advance(response, seconds, intensity) {
  let state
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    if (intensity !== undefined) response.receive({
      intensity, direction: { x: 1, y: 0 }, regions: [0, 0, intensity],
    })
    state = response.update(1 / 60)
  }
  return state
}

test('greeting opens gently, sustains motion, and returns to the original idle baseline', () => {
  const response = new MotionResponse()
  const idle = response.update(0)
  assert.deepEqual(idle, { energy: 0.18, expansion: 0, excitement: 0.04, motionDirection: { x: 0, y: 0 } })
  const first = advance(response, 1 / 60, 1)
  assert.ok(first.expansion > 0 && first.expansion < 0.07)
  const excited = advance(response, 4, 1)
  assert.ok(excited.expansion > 0.85 && excited.excitement > 0.8)
  assert.ok(excited.motionDirection.x > 0.9)
  const lingering = advance(response, 0.2, 0)
  assert.ok(lingering.expansion > excited.expansion * 0.95)
  const resting = advance(response, 20, 0)
  assert.ok(resting.expansion < 0.002)
  assert.ok(Math.abs(resting.energy - idle.energy) < 0.002)
  assert.ok(Math.abs(resting.excitement - idle.excitement) < 0.002)
  assert.ok(Math.abs(resting.motionDirection.x) < 0.002)
})

test('weak activity opens less; stale camera samples decay without more callbacks', () => {
  const weak = new MotionResponse()
  const strong = new MotionResponse()
  assert.ok(advance(weak, 4, 0.15).expansion < advance(strong, 4, 0.9).expansion)
  assert.ok(advance(strong, 10, 0.15).expansion < 0.35)
  assert.ok(advance(strong, 22).expansion < 0.002)
  weak.receive(quietMotion())
  assert.ok(Number.isFinite(weak.update(Number.NaN).energy))
})

test('low-contrast body movement survives detection and reaches actual entity state', () => {
  const detector = new FrameDifference(WIDTH, HEIGHT)
  const response = new MotionResponse()
  const entity = new DesireEntity()
  const movingFrame = (offset) => frame((x, y) =>
    70 + (x >= offset && x < offset + 24 && y > 15 && y < 58 ? 10 : 0))
  detector.analyze(movingFrame(20))
  const sample = detector.analyze(movingFrame(25))
  // Regression: the original threshold of 12 returned exactly zero here.
  assert.ok(sample.intensity > 0.1 && sample.intensity < 0.6)
  for (let i = 0; i < 4 * 60; i++) {
    if (i % 5 === 0) response.receive(sample)
    entity.setState(response.update(1 / 60))
    entity.update(1 / 60)
  }
  const state = entity.getState()
  assert.ok(response.getDiagnostics().smoothed > 0.1)
  assert.ok(state.expansion > 0.12)
  assert.ok(state.excitement > 0.15)
  assert.ok(state.energy > 0.25)
  assert.ok(Math.abs(state.motionDirection.x) > 0.01)
})

test('temporal camera noise and sparse hot pixels do not sustain activity', () => {
  const detector = new FrameDifference(WIDTH, HEIGHT)
  let seed = 1729
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < 60; i++) {
    const image = frame((x, y) => 70 + Math.round((random() - 0.5) * 12)
      + (x === i && y === 20 ? 120 : 0))
    assert.equal(detector.analyze(image).intensity, 0)
  }
})
