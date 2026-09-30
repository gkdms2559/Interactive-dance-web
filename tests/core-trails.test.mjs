import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CoreMotion } from '../src/entities/CoreMotion.ts'
import { TrailSystem } from '../src/trails/TrailSystem.ts'

const pose = () => ({ viewport: { width: 1200, height: 900 }, left: null, right: null, head: { x: 0, y: 0 } })
const hand = (x) => ({ target: { x, y: 450 }, x: Math.sign(x - 600), y: 0,
  distance: Math.abs(x - 600), reachAmount: 1, activity: 1, speed: 0.4 })
function advance(core, input, seconds) {
  for (let i = 0; i < seconds * 60; i++) core.update(1 / 60, input)
}

test('nose position immediately owns the core; hands never steer it', () => {
  const core = new CoreMotion(), input = pose()
  input.right = hand(1130)
  input.headTarget = { x: 340, y: 230 }
  core.update(1 / 60, input)
  assert.deepEqual(core.getOffset(), { x: -260, y: -220 })
  input.headTarget = { x: 760, y: 600 }
  core.update(1 / 60, input)
  assert.deepEqual(core.getOffset(), { x: 160, y: 150 })
  assert.equal(core.getDiagnostics().state, 'head tracking')
  input.headTarget = null
  advance(core, input, 20)
  assert.deepEqual(core.getOffset(), { x: 160, y: 150 }, 'no autonomous wandering on loss')
})

test('idle holds center before tracking and resize preserves normalized location', () => {
  const core = new CoreMotion(), input = pose()
  advance(core, input, 10)
  assert.deepEqual(core.getOffset(), { x: 0, y: 0 })
  input.headTarget = { x: 300, y: 450 }
  core.update(1 / 60, input)
  input.headTarget = null; input.viewport = { width: 600, height: 450 }
  core.update(1 / 60, input)
  assert.deepEqual(core.getOffset(), { x: -150, y: 0 })
})

function lines(trails) {
  const result = []
  let start
  const ctx = { save() {}, restore() {}, beginPath() {}, stroke() {},
    moveTo(x, y) { start = { x, y } },
    quadraticCurveTo(cx, cy, x, y) { result.push({ start, end: { x, y }, alpha: Number(this.strokeStyle.match(/,([^,]+)\)$/)[1]) }) } }
  trails.draw(ctx)
  return result
}
const age = (trails, seconds, core) => {
  for (let i = 0; i < seconds * 20; i++) trails.update(0.05, core)
}

test('old threads revive as a connected local section, then fade without lighting the whole path', () => {
  const trails = new TrailSystem()
  for (let x = 0; x <= 1000; x += 5) trails.capture({ core: { x, y: 100 }, tendrils: [] })
  const fresh = lines(trails)[0].alpha
  age(trails, 120, { x: -1000, y: -1000 })
  const faded = lines(trails)[0].alpha
  assert.ok(faded < fresh * 0.1 && faded > 0)
  age(trails, 2, { x: 500, y: 100 })
  const revived = lines(trails).filter(s => s.alpha > 0.02).sort((a, b) => a.start.x - b.start.x)
  assert.ok(revived.length > 8 && revived.length < 50)
  for (let i = 1; i < revived.length; i++) assert.equal(revived[i - 1].end.x, revived[i].start.x)
  assert.ok(revived[0].start.x > 350 && revived.at(-1).end.x < 650)
  assert.ok(trails.getDiagnostics().reactivatedCount > 0)
  age(trails, 25, { x: -1000, y: -1000 })
  assert.equal(trails.getDiagnostics().reactivatedCount, 0)
  assert.ok(Math.max(...lines(trails).map(s => s.alpha)) < 0.01)
})

test('trail sampling avoids stationary accumulation and caps history with gradual retirement', () => {
  const trails = new TrailSystem()
  const source = { core: { x: 0, y: 0 }, tendrils: [{ id: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }] }
  for (let i = 0; i < 100; i++) { trails.capture(source); trails.update(0.05, source.core) }
  assert.equal(trails.getDiagnostics().segmentCount, 1)
  for (let i = 0; i < 6500; i++) trails.capture({ core: { x: i * 5, y: 0 }, tendrils: [] })
  assert.equal(trails.getDiagnostics().segmentCount, 6000)
  trails.update(0.05, { x: -1000, y: -1000 })
  assert.equal(trails.getDiagnostics().segmentCount, 6000, 'budget retirement does not delete immediately')
  age(trails, 9, { x: -1000, y: -1000 })
  assert.ok(trails.getDiagnostics().segmentCount <= 4800)
})
