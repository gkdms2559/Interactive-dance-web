import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PoseTracker } from '../src/modules/pose/PoseTracker.ts'
import { PoseResponse } from '../src/modules/art/PoseResponse.ts'
import { handAffinity } from '../src/entities/PoseInfluence.ts'
import { calculateReach } from '../src/modules/pose/reachAmount.ts'

const landmark = (x, y = 0.5, visibility = 1) => ({ x, y, visibility })
const raw = (leftWrist = null, rightWrist = null, nose = null) => ({ nose, leftWrist, rightWrist })

test('mirror mapping preserves anatomical hand identities and filters missing landmarks individually', () => {
  const tracker = new PoseTracker()
  const pose = tracker.receive(raw(landmark(0.2), landmark(0.8), landmark(0.45, 0.25)), 100, 1200, 800)
  assert.equal(pose.leftWrist.x, 0.8)
  assert.ok(Math.abs(pose.rightWrist.x - 0.2) < 1e-9)
  assert.equal(pose.nose.y, 0.25)
  assert.equal(pose.leftWrist.speed, 0)
  const occluded = tracker.receive(raw(landmark(0.2, 0.5, 0.2), landmark(0.8)), 200, 1200, 800)
  assert.equal(occluded.leftWrist, null)
  assert.ok(occluded.rightWrist)
  assert.equal(occluded.detected, true)
  assert.equal(tracker.receive(raw(), 300, 1200, 800).detected, false)
})

test('reach is body-size invariant, low near shoulders, and independent for each arm', () => {
  const pose = {
    imageAspect: 4 / 3,
    leftShoulder: landmark(0.4), rightShoulder: landmark(0.6),
    leftWrist: landmark(0.1), rightWrist: landmark(0.58),
  }
  assert.equal(calculateReach(pose, 'left'), 1)
  assert.equal(calculateReach(pose, 'right'), 0)
  const smaller = Object.fromEntries(Object.entries(pose).map(([key, value]) => [key,
    typeof value === 'number' ? value : { ...value, x: 0.5 + (value.x - 0.5) * 0.5, y: 0.5 + (value.y - 0.5) * 0.5 }]))
  assert.equal(calculateReach(smaller, 'left'), 1)
  assert.equal(calculateReach(smaller, 'right'), 0)
  const partial = calculateReach({ ...pose, leftWrist: landmark(0.25) }, 'left')
  assert.ok(partial > 0.1 && partial < 0.5)
  assert.equal(calculateReach({ ...pose, rightShoulder: null }, 'left'), 0)
  assert.equal(calculateReach({ ...pose, rightShoulder: landmark(0.4001) }, 'left'), 0)
})

test('camera mirror coordinates reach the correct canvas quadrants, including after resize', () => {
  const tracker = new PoseTracker()
  const pose = tracker.receive({ imageAspect: 4 / 3, nose: landmark(0.5, 0.2),
    leftShoulder: landmark(0.6), rightShoulder: landmark(0.4),
    leftWrist: landmark(0.9, 0.8), rightWrist: landmark(0.1, 0.2),
  }, 100, 1200, 900)
  const response = new PoseResponse()
  response.receive(pose)
  const a = response.update(1 / 60, 1200, 900).influence
  assert.ok(Math.abs(a.left.target.x - 120) < 0.001)
  assert.equal(a.left.target.y, 720)
  assert.equal(a.right.target.x, 1080)
  assert.equal(a.right.target.y, 180)
  assert.ok(a.left.x < 0 && a.left.y > 0 && a.right.x > 0 && a.right.y < 0)
  const b = response.update(1 / 60, 390, 844).influence
  assert.ok(Math.abs(b.right.target.x - 351) < 0.001)
  assert.ok(Math.abs(b.right.target.y - 168.8) < 0.001)
  assert.ok(b.right.distance > 200)
})

test('wrist velocity uses time, ignores jitter, and has no spike on reappearance', () => {
  const tracker = new PoseTracker()
  tracker.receive(raw(landmark(0.2)), 100, 1200, 800)
  const moving = tracker.receive(raw(landmark(0.3)), 200, 1200, 800)
  assert.ok(moving.leftWrist.speed > 0.2)
  let stationary
  for (let i = 3; i < 35; i++) stationary = tracker.receive(raw(landmark(0.3 + (i % 2) * 0.001)), i * 100, 1200, 800)
  assert.ok(stationary.leftWrist.speed < 0.005)
  tracker.receive(raw(), 3500, 1200, 800)
  assert.equal(tracker.receive(raw(landmark(0.9)), 3600, 1200, 800).leftWrist.speed, 0)
  assert.equal(tracker.receive(raw(landmark(0.1)), 5000, 1200, 800).leftWrist.speed, 0)
})

test('angular attention wraps correctly and never averages opposing hands', () => {
  const hand = { x: -1, y: 0, distance: 1, activity: 1, speed: 0 }
  assert.equal(handAffinity(-Math.PI + 0.05, hand), 1)
  assert.equal(handAffinity(0, hand), 0)
  assert.ok(handAffinity(Math.PI * 0.8, hand) > 0.6)
})

test('response preserves stationary reach while excitement settles, and stale hands release', () => {
  const response = new PoseResponse()
  const pose = {
    detected: true, nose: { x: 0.6, y: 0.2, speed: 0.1 },
    imageAspect: 4 / 3,
    leftShoulder: { x: 0.4, y: 0.5, speed: 0 }, rightShoulder: { x: 0.6, y: 0.5, speed: 0 },
    leftWrist: { x: 0.1, y: 0.5, speed: 0.7 },
    rightWrist: { x: 0.9, y: 0.5, speed: 0.7 },
  }
  let active
  for (let i = 0; i < 180; i++) {
    response.receive(pose)
    active = response.update(1 / 60, 1200, 800)
  }
  assert.equal(active.state.expansion, 0)
  assert.ok(active.influence.left.x < -0.99 && active.influence.right.x > 0.99)
  assert.ok(active.influence.left.activity > 0.9 && active.influence.right.activity > 0.9)
  assert.ok(active.state.excitement > 0.7)
  const stopped = { ...pose, nose: { ...pose.nose, speed: 0 }, leftWrist: { ...pose.leftWrist, speed: 0 }, rightWrist: { ...pose.rightWrist, speed: 0 } }
  let idle
  for (let i = 0; i < 360; i++) { response.receive(stopped); idle = response.update(1 / 60, 1200, 800) }
  assert.ok(idle.state.excitement < 0.045)
  assert.ok(idle.influence.left.reachAmount > 0.99)
  assert.ok(idle.influence.left.activity > 0.99)
  assert.ok(Math.abs(idle.influence.head.x) < 0.005)

  const diagonal = new PoseResponse()
  diagonal.receive({ ...pose, leftWrist: { x: 0.75, y: 0.75, speed: 0.5 } })
  const mapped = diagonal.update(1 / 60, 1200, 600).influence.left
  assert.ok(Math.abs(mapped.x / mapped.y - 2) < 0.001)
  for (let i = 0; i < 400; i++) diagonal.update(1 / 60, 1200, 600)
  assert.ok(diagonal.update(1 / 60, 1200, 600).influence.left.activity < 0.005)
})
