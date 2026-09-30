import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WebcamPoseDetector } from '../src/modules/pose/WebcamPoseDetector.ts'

async function browserTest(run) {
  const originals = new Map()
  const replace = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, value })
  }
  const track = Object.assign(new EventTarget(), { enabled: true, stopped: 0, stop() { this.stopped++ } })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const video = { muted: false, playsInline: false, srcObject: null, readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 0, play: async () => {}, pause() {} }
  const document = Object.assign(new EventTarget(), { hidden: false, createElement: () => video })
  const frames = new Map()
  const worker = { onmessage: null, onerror: null, messages: [], terminated: 0,
    postMessage(message) { this.messages.push(message) }, terminate() { this.terminated++ } }
  const devices = { getUserMedia: async () => stream }
  const samples = []
  const detectors = []
  let clock = performance.now()
  let frameId = 0
  let bitmapCloses = 0
  replace('document', document)
  replace('navigator', { mediaDevices: devices })
  replace('requestAnimationFrame', (callback) => { frames.set(++frameId, callback); return frameId })
  replace('cancelAnimationFrame', (id) => frames.delete(id))
  replace('createImageBitmap', async () => ({ close() { bitmapCloses++ } }))
  const originalWarn = console.warn
  console.warn = () => {}
  const create = () => {
    const detector = new WebcamPoseDetector((landmarks) => samples.push(landmarks), {
      wasmRoot: '/wasm', modelUrl: '/pose.task', createWorker: () => worker,
    })
    detectors.push(detector)
    return detector
  }
  const tick = async () => {
    clock += 100
    video.currentTime += 0.1
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(clock))
    await Promise.resolve()
  }
  const reply = (message) => worker.onmessage({ data: message })
  try { await run({ create, worker, tick, reply, samples, devices, stream, track, video, document, frames, closed: () => bitmapCloses }) }
  finally {
    detectors.forEach((detector) => detector.stop())
    console.warn = originalWarn
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  }
}

test('pose capture waits for model readiness and allows exactly one inference in flight', async () => {
  await browserTest(async ({ create, worker, tick, reply, samples, video, track }) => {
    const detector = create()
    await detector.start()
    assert.equal(video.srcObject !== null, true)
    await tick()
    assert.equal(worker.messages.length, 1)
    assert.equal(worker.messages[0].type, 'init')
    reply({ type: 'ready' })
    await tick()
    const frame = worker.messages.at(-1)
    assert.equal(frame.type, 'frame')
    await tick()
    assert.equal(worker.messages.length, 2)
    const landmarks = { nose: { x: 0.4, y: 0.2 }, leftWrist: { x: 0.1, y: 0.5 }, rightWrist: { x: 0.9, y: 0.5 } }
    reply({ type: 'result', landmarks, timestamp: frame.timestamp, epoch: frame.epoch, inferenceMs: 20 })
    assert.deepEqual(samples.at(-1), landmarks)
    await tick()
    assert.equal(worker.messages.length, 3)
    assert.equal(detector.getDiagnostics().inferences, 1)
    detector.stop()
    assert.equal(worker.terminated, 1)
    assert.equal(track.stopped, 1)
  })
})

test('hidden tabs discard stale worker results and resume without an image backlog', async () => {
  await browserTest(async ({ create, worker, tick, reply, samples, document, track, frames }) => {
    const detector = create()
    await detector.start()
    reply({ type: 'ready' })
    await tick()
    const old = worker.messages.at(-1)
    document.hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    assert.equal(track.enabled, false)
    assert.equal(frames.size, 0)
    const count = samples.length
    reply({ type: 'result', landmarks: { nose: { x: 0.5, y: 0.2 } }, timestamp: old.timestamp, epoch: old.epoch, inferenceMs: 10 })
    assert.equal(samples.length, count)
    document.hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await tick()
    assert.equal(track.enabled, true)
    assert.notEqual(worker.messages.at(-1).epoch, old.epoch)
  })
})

test('model errors, denied permissions, and late permission results preserve idle and release resources', async () => {
  await browserTest(async ({ create, worker, reply, samples, devices, stream, track }) => {
    const detector = create()
    devices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') }
    await detector.start()
    assert.equal(detector.getDiagnostics().camera, 'denied')
    assert.equal(samples.at(-1).nose, null)
    let resolvePermission
    devices.getUserMedia = () => new Promise((resolve) => { resolvePermission = resolve })
    const pending = detector.start()
    detector.stop()
    resolvePermission(stream)
    await pending
    assert.equal(track.stopped, 1)
    devices.getUserMedia = async () => stream
    await detector.start()
    reply({ type: 'error', message: 'Model unavailable' })
    assert.equal(detector.getDiagnostics().model, 'error')
    assert.equal(detector.getDiagnostics().camera, 'inactive')
    assert.equal(worker.terminated, 1)
    assert.equal(samples.at(-1).leftWrist, null)
  })
})
