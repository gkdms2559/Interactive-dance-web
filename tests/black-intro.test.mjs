import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CoreBehavior } from '../src/pieces/black-core/CoreBehavior.ts'
import { IntroSequence } from '../src/pieces/black-core/IntroSequence.ts'
import { Stardust } from '../src/pieces/black-core/Stardust.ts'
import { BLACK_CONFIG as C } from '../src/pieces/black-core/config.ts'
import { noPose } from '../src/modules/pose/types.ts'

const pose = x => ({ ...noPose(), detected: true, leftWrist: { x, y: .5, speed: 0 } })
const core = { x: 260, y: 590 }
function activate(sequence) {
  for (let i = 0; i < 200 && sequence.state === 'INTRO'; i++) {
    sequence.receive(pose(i % 2 ? .7 : .3), i * 100)
    sequence.update(.05, core); sequence.update(.05, core)
  }
  assert.equal(sequence.state, 'DOOR_OPEN')
}
test('autonomous habits hold durations, cover all states, and stay safely inside resized viewports', () => {
  let seed = 7
  const behavior = new CoreBehavior(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 })
  behavior.resize(1200, 900)
  const counts = {}, durations = []
  let last = behavior.snapshot(), duration = 0, width = 1200, height = 900
  for (let i = 0; i < 36000; i++) {
    if (i === 18000) { width = 390; height = 844; behavior.resize(width, height); last = behavior.snapshot() }
    behavior.update(1 / 60)
    const now = behavior.snapshot()
    counts[now.state] = (counts[now.state] ?? 0) + 1
    assert.ok(now.position.x >= C.CORE_SAFE_MARGIN && now.position.x <= width - C.CORE_SAFE_MARGIN)
    assert.ok(now.position.y >= C.CORE_SAFE_MARGIN && now.position.y <= height - C.CORE_SAFE_MARGIN)
    assert.ok(Math.hypot(now.position.x - last.position.x, now.position.y - last.position.y) < 8, 'no teleport')
    if (now.state !== last.state) {
      if (durations.length) assert.ok(duration >= C.BEHAVIORS[last.state].min - .04)
      if (last.state === 'DASH') assert.ok(['REST', 'DRIFT'].includes(now.state))
      durations.push(duration); duration = 0
    }
    duration += 1 / 60; last = now
  }
  assert.deepEqual(Object.keys(counts).sort(), Object.keys(C.BEHAVIORS).sort())
  assert.ok((counts.REST + counts.DRIFT) / 36000 > .8)
  assert.ok(counts.DASH / 36000 < .03)
})
test('jitter, a single gesture and missing samples cannot open the door; quiet activity decays', () => {
  const seq = new IntroSequence()
  for (let i = 0; i < 100; i++) { seq.receive(pose(.5 + (i % 2) * .0005), i * 100); seq.update(.05, core); seq.update(.05, core) }
  assert.equal(seq.activity, 0)
  seq.receive(pose(.9), 10000); seq.update(.05, core)
  assert.ok(seq.activity > 0)
  for (let i = 0; i < 300; i++) seq.update(.05, core)
  assert.equal(seq.activity, 0); assert.equal(seq.state, 'INTRO')
})
test('door sequence departs from the actual core, travels continuously, covers from door origin and completes only once', () => {
  const seq = new IntroSequence(); seq.resize(1200, 900); activate(seq)
  assert.deepEqual(seq.presentation().position, core)
  const states = new Set([seq.state]); let previous = core
  let radialDraws = 0, finalFill = null
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
    arc(x, y, radius) { const door = seq.door(); assert.equal(x, door.x); assert.equal(y, door.y); assert.ok(radius >= 0); assert.equal(this.globalAlpha, 1); radialDraws++ },
    fillRect(...args) { finalFill = args; assert.equal(this.fillStyle, '#ffffff') } }
  for (let i = 0; i < 240; i++) {
    seq.update(.05, previous)
    const position = seq.presentation().position
    assert.ok(Math.hypot(position.x - previous.x, position.y - previous.y) < 30)
    previous = position; states.add(seq.state); seq.draw(ctx)
  }
  assert.deepEqual([...states], ['DOOR_OPEN', 'APPROACHING_DOOR', 'ENTERING_DOOR', 'WHITE_TRANSITION', 'INTRO_COMPLETE'])
  assert.ok(radialDraws > 20); assert.deepEqual(finalFill, [0, 0, 1200, 900])
  seq.receive(pose(.1), 100000); seq.update(.05, previous)
  assert.equal(seq.state, 'INTRO_COMPLETE')
  seq.resize(390, 844); seq.draw(ctx); assert.deepEqual(finalFill, [0, 0, 390, 844])
})
test('stardust is movement-driven, bounded over long sessions and completely expires at rest', () => {
  const dust = new Stardust()
  for (let i = 0; i < 300; i++) dust.update(.05, core)
  assert.equal(dust.count, 0)
  for (let i = 0; i < 10000; i++) { dust.update(.05, { x: i % 1200, y: i % 900 }); assert.ok(dust.count <= C.PARTICLE_MAX_COUNT) }
  assert.ok(dust.count > 0)
  for (let i = 0; i < 200; i++) dust.update(.05, core)
  assert.equal(dust.count, 0)
})
