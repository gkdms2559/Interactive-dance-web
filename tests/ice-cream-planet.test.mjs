import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PlanetDrawing } from '../src/pieces/ice-cream-planet/PlanetDrawing.ts'
import { ICE_CONFIG as C, seededRandom } from '../src/pieces/ice-cream-planet/config.ts'
import { DrawingLayer } from '../src/pieces/ice-cream-planet/DrawingLayer.ts'
import { planetTexture, randomSparkle, sparkle } from '../src/pieces/ice-cream-planet/pencil.ts'

const hand = (x, y) => ({ x, y, speed: 0 })
const pose = (leftWrist = null, rightWrist = null) => ({ leftWrist, rightWrist })
function advance(model, seconds) {
  const segments = [], stars = []
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    model.update(1 / 60)
    const marks = model.drain()
    segments.push(...marks.segments); stars.push(...marks.stars)
  }
  return { segments, stars }
}

test('five distinct planets exist immediately, float locally and generate no idle vines', () => {
  assert.equal(C.planets.length, 5)
  assert.equal(new Set(C.planets.map(p => p.radius)).size, 5)
  assert.equal(new Set(C.planets.map(p => p.color)).size, 5)
  const model = new PlanetDrawing(seededRandom(3)); model.resize(1200, 900)
  const original = C.planets.map((_, i) => model.planet(i))
  assert.equal(advance(model, 30).segments.length, 0)
  original.forEach((p, i) => assert.ok(Math.hypot(p.x - model.planet(i).x, p.y - model.planet(i).y) < C.planetFloatAmount * 3))
})

test('stationary wrists and camera jitter never accumulate growth; reacquisition does not draw a jump', () => {
  const model = new PlanetDrawing(seededRandom(5))
  for (let i = 0; i < 150; i++) {
    model.receive(pose(hand(0.24 + (i % 2) * 0.001, 0.27)), i * 100)
    assert.equal(advance(model, 0.1).segments.length, 0)
  }
  model.receive(pose(), 15100); advance(model, 0.1)
  model.receive(pose(hand(0.95, 0.9)), 15200)
  assert.equal(advance(model, 0.2).segments.length, 0)
  assert.equal(model.getDiagnostics().growingVines, 0)
})

test('two hands select independent nearby planets and each generates ornamental growth', () => {
  const model = new PlanetDrawing(seededRandom(8))
  model.receive(pose(hand(0.24, 0.27), hand(0.73, 0.21)), 0)
  advance(model, 0.1)
  model.receive(pose(hand(0.28, 0.30), hand(0.78, 0.24)), 100)
  assert.deepEqual(model.getDiagnostics().activePlanets, [0, 1])
  const marks = advance(model, 0.5)
  assert.ok(marks.segments.length > 30)
  assert.ok(marks.segments.some(s => s.a.x < 500) && marks.segments.some(s => s.a.x > 700))
  assert.ok(marks.segments.every(s => C.palette.includes(s.color)))
  assert.ok(marks.segments.every(s => Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y) <= 2.501))
})

test('planet switching uses cooldown and improvement, then releases stale selection', () => {
  const model = new PlanetDrawing(seededRandom(15))
  model.receive(pose(hand(0.24, 0.27)), 0)
  advance(model, 0.1)
  model.receive(pose(hand(0.51, 0.51)), 100)
  assert.equal(model.getDiagnostics().activePlanets[0], 0)
  for (let i = 2; i <= 8; i++) { advance(model, 0.1); model.receive(pose(hand(0.51, 0.51)), i * 100) }
  assert.equal(model.getDiagnostics().activePlanets[0], 2)
  advance(model, 0.7)
  assert.equal(model.getDiagnostics().activePlanets[0], -1)
})

test('strong movement can trigger only one or two neighboring planets; completed vines stop calculating', () => {
  const model = new PlanetDrawing(() => 0)
  model.receive(pose(hand(0.24, 0.27)), 0)
  advance(model, 0.1)
  model.receive(pose(hand(0.40, 0.27)), 100)
  const reactions = model.getDiagnostics().planetPulses.filter(p => p > 0.3)
  assert.ok(reactions.length >= 2 && reactions.length <= 3)
  const drawn = advance(model, 12)
  assert.ok(drawn.segments.length > 100 && drawn.stars.length > 0)
  assert.equal(model.getDiagnostics().growingVines, 0)
  assert.equal(advance(model, 30).segments.length, 0)
  assert.equal(model.drain().segments.length, 0, 'consumed paths are not retained for redraw')
})

test('long sessions keep a bounded active model and resize alone never produces gestures', () => {
  const model = new PlanetDrawing(seededRandom(75))
  for (let i = 0; i < 600; i++) {
    model.receive(pose(hand(0.3 + Math.sin(i * 0.7) * 0.2, 0.3), hand(0.75, 0.5 + Math.cos(i * 0.9) * 0.3)), i * 100)
    advance(model, 0.1)
    assert.ok(model.getDiagnostics().growingVines <= C.maxGrowingVines)
    assert.ok(model.getDiagnostics().rememberedTips <= C.planets.length * C.rememberedTipsPerPlanet)
  }
  assert.equal(model.getDiagnostics().densityCells, C.densityColumns * C.densityRows)
  advance(model, 12)
  model.resize(390, 844)
  model.receive(pose(hand(0.9, 0.1)), 80000)
  assert.equal(advance(model, 0.2).segments.length, 0)
})

test('persistent drawing is rasterized once and copied on resize, with no history clearing', () => {
  const original = globalThis.document
  const canvases = []
  globalThis.document = { createElement() {
    const calls = []
    const context = { calls, setTransform() {}, drawImage(...args) { calls.push(['image', ...args]) },
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() { calls.push(['stroke']) } }
    const canvas = { width: 1, height: 1, getContext: () => context }
    canvases.push({ canvas, context }); return canvas
  } }
  try {
    const layer = new DrawingLayer()
    layer.resize(1200, 900, 2)
    const source = canvases.at(-1)
    assert.equal(source.canvas.width, 1200 * C.pixelRatioCap)
    layer.append({ segments: [{ a: { x: 10, y: 20 }, b: { x: 25, y: 32 }, color: C.palette[0], width: 1, seed: 1 }], stars: [] })
    assert.equal(source.context.calls.filter(c => c[0] === 'stroke').length, 3)
    const presented = []
    for (let i = 0; i < 60; i++) layer.draw({ drawImage: (...args) => presented.push(args) })
    assert.equal(source.context.calls.filter(c => c[0] === 'stroke').length, 3)
    assert.equal(presented.length, 60)
    layer.resize(390, 844, 1)
    assert.equal(canvases.at(-1).context.calls[0][1], source.canvas, 'old raster survives resizing')
    layer.dispose()
    assert.equal(canvases.at(-1).canvas.width, 1)
  } finally { globalThis.document = original }
})

test('one stem produces several finer side curls instead of a single same-width fork', () => {
  const model = new PlanetDrawing(() => 0.5)
  model.receive(pose(hand(0.24, 0.27)), 0)
  advance(model, 0.1)
  model.receive(pose(hand(0.265, 0.29)), 100)
  const marks = advance(model, 8).segments
  const starts = new Map()
  for (const mark of marks) {
    const key = `${mark.a.x.toFixed(4)},${mark.a.y.toFixed(4)}`
    starts.set(key, (starts.get(key) ?? 0) + 1)
  }
  assert.ok([...starts.values()].filter(n => n > 1).length >= 2, 'multiple attached branches')
  assert.ok(Math.max(...marks.map(s => s.width)) / Math.min(...marks.map(s => s.width)) > 2)
  assert.equal(model.getDiagnostics().growingVines, 0)
})

test('ornament palette includes rare large filled stars and abundant small ornaments', () => {
  const random = seededRandom(829)
  const stars = Array.from({ length: 300 }, () => randomSparkle({ x: 100, y: 100 }, random))
  const large = stars.filter(s => s.size >= C.largeStarMinSize)
  assert.ok(large.length > 15 && large.length < 70)
  assert.ok(large.every(s => s.kind !== 2))
  let clipped = 0, filled = 0, stroked = 0
  const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    clip() { clipped++ }, fillRect() { filled++ }, stroke() { stroked++ } }
  sparkle(ctx, large[0])
  assert.equal(clipped, 1)
  assert.equal(filled, 1)
  assert.ok(stroked > 30, 'pencil fill plus silhouette, not only an outline')
})

test('all five cached planet textures contain curved pigment rubbing and distinct multi-color recipes', () => {
  const original = globalThis.document
  const records = []
  globalThis.document = { createElement() {
    const record = { arcs: 0, colors: new Set() }
    records.push(record)
    const context = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {},
      fillRect() {}, fill() {}, ellipse() { record.arcs++ }, stroke() { record.colors.add(this.strokeStyle) } }
    return { width: 1, height: 1, getContext: () => context }
  } }
  try {
    for (let i = 0; i < 5; i++) {
      const texture = planetTexture(i)
      assert.equal(texture.width, C.textureSize)
      assert.ok(records[i].arcs > 4000)
      for (const color of C.planetPigments[i].colors) assert.ok(records[i].colors.has(color))
    }
  } finally { globalThis.document = original }
})
