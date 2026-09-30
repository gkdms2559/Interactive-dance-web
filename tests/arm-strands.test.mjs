import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ArmStrands, armPoint } from '../src/entities/ArmStrands.ts'
import { PoseTracker } from '../src/modules/pose/PoseTracker.ts'
import { PoseResponse } from '../src/modules/art/PoseResponse.ts'
import { DesireEntity } from '../src/entities/DesireEntity.ts'

const point = (x, y) => ({ x, y, visibility: 1 })
const raw = () => ({ nose: point(0.5, 0.2), imageAspect: 4 / 3,
  leftShoulder: point(0.6, 0.4), leftElbow: point(0.8, 0.55), leftWrist: point(0.65, 0.3),
  rightShoulder: point(0.4, 0.4), rightElbow: point(0.2, 0.55), rightWrist: point(0.1, 0.65) })
function render(arms, core, left, right) {
  const strokes = []
  let a, b
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo(x, y) { a = { x, y } },
    lineTo(x, y) { b = { x, y } }, stroke() { strokes.push({ a, b, width: this.lineWidth }) } }
  arms.draw(ctx, core, left, right)
  return strokes
}

test('pose adapter preserves arm data while the active entity ignores nose positioning', () => {
  const tracker = new PoseTracker(), response = new PoseResponse(), entity = new DesireEntity()
  response.receive(tracker.receive(raw(), 100, 1200, 900))
  let input = response.update(1 / 60, 1200, 900)
  entity.setPoseInfluence(input.influence); entity.update(1 / 60)
  assert.deepEqual(entity.getCoreDiagnostics().position, { x: 600, y: 450 })
  assert.ok(Math.abs(input.influence.left.arm.elbow.x - 240) < 1e-9)
  const arms = new ArmStrands()
  const strokes = render(arms, entity.getCoreDiagnostics().position, input.influence.left, input.influence.right)
  assert.equal(strokes.length, 2 * 12 * 48)
  assert.deepEqual(strokes[47].b, input.influence.left.target)
  assert.deepEqual(strokes[12 * 48 + 47].b, input.influence.right.target)
  assert.ok(Math.max(...strokes.map(s => s.width)) <= 0.8)
  const moved = raw(); moved.nose = point(0.2, 0.35); moved.leftWrist = point(0.9, 0.8)
  response.receive(tracker.receive(moved, 200, 1200, 900))
  input = response.update(1 / 60, 1200, 900)
  entity.setPoseInfluence(input.influence); entity.update(1 / 60)
  assert.deepEqual(entity.getCoreDiagnostics().position, { x: 600, y: 450 })
  const next = render(arms, entity.getCoreDiagnostics().position, input.influence.left, input.influence.right)
  assert.deepEqual(next[47].b, input.influence.left.target)
  assert.deepEqual(next[12 * 48 + 47].b, strokes[12 * 48 + 47].b)
})

test('arm spline passes through the elbow with a continuous tangent and bends independently of wrist', () => {
  const nodes = [{ x: 600, y: 150 }, { x: 500, y: 300 }, { x: 300, y: 500 }, { x: 450, y: 240 }]
  assert.deepEqual(armPoint(nodes, 2 / 3), nodes[2])
  const before = armPoint(nodes, 2 / 3 - 0.0001), after = armPoint(nodes, 2 / 3 + 0.0001)
  const a = { x: nodes[2].x - before.x, y: nodes[2].y - before.y }
  const b = { x: after.x - nodes[2].x, y: after.y - nodes[2].y }
  assert.ok((a.x * b.x + a.y * b.y) / Math.hypot(a.x, a.y) / Math.hypot(b.x, b.y) > 0.999)
  const straight = [...nodes]; straight[2] = { x: 475, y: 270 }
  assert.ok(Math.hypot(armPoint(nodes, 0.65).x - armPoint(straight, 0.65).x,
    armPoint(nodes, 0.65).y - armPoint(straight, 0.65).y) > 200)
})

test('missing elbows retain wrist accuracy; trails exclude secondary strands and small gestures', () => {
  const tracker = new PoseTracker(), response = new PoseResponse(), arms = new ArmStrands()
  const input = raw(); input.leftElbow.visibility = 0.1; input.rightWrist = null
  response.receive(tracker.receive(input, 100, 1200, 900))
  const hand = response.update(1 / 60, 1200, 900).influence.left
  assert.equal(hand.arm.elbow, null)
  hand.reachAmount = 0.1; hand.speed = 0
  let strokes = render(arms, { x: 600, y: 180 }, hand, null)
  assert.deepEqual(strokes[47].b, hand.target)
  assert.equal(arms.getTrails().length, 0)
  hand.reachAmount = 1
  strokes = render(arms, { x: 600, y: 180 }, hand, null)
  assert.equal(arms.getTrails().length, 1)
  assert.deepEqual(arms.getTrails()[0].points.at(-1), strokes[47].b)
})
