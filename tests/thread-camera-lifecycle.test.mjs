import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HandCamera } from '../src/pieces/thread-camera/HandCamera.ts'

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
    const detector = new HandCamera(video, (landmarks) => samples.push(landmarks), () => {}, {
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

test('thread camera displays the single stream before the model is ready, permits one inference, and keeps video on model failure', async () => {
  await browserTest(async ({ create, worker, tick, reply, samples, video, stream, track, devices }) => {
    let requests = 0
    devices.getUserMedia = async options => { requests++; assert.equal(options.audio, false); return stream }
    const camera = create()
    await camera.start(); await camera.start()
    assert.equal(requests, 1)
    assert.equal(video.srcObject, stream)
    await tick(); assert.equal(worker.messages.length, 1)
    reply({ type: 'ready' }); await tick()
    const request = worker.messages.at(-1)
    await tick(); assert.equal(worker.messages.length, 2)
    reply({ type: 'result', hands: [], width: 320, height: 240, timestamp: request.timestamp, epoch: request.epoch })
    assert.equal(samples.at(-1).width, video.videoWidth)
    reply({ type: 'error', message: 'Model failed' })
    assert.equal(video.srcObject, stream)
    assert.equal(track.stopped, 0)
    assert.equal(worker.terminated, 1)
    camera.stop()
    assert.equal(video.srcObject, null); assert.equal(track.stopped, 1)
  })
})

test('thread camera discards hidden-tab inference, resumes capture and releases late permission', async () => {
  await browserTest(async ({ create, worker, tick, reply, samples, document, track, devices, stream }) => {
    const camera = create()
    await camera.start(); reply({ type: 'ready' }); await tick()
    const old = worker.messages.at(-1)
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'))
    reply({ type: 'result', hands: [], width: 640, height: 480, timestamp: old.timestamp, epoch: old.epoch })
    assert.equal(samples.length, 0); assert.equal(track.enabled, false)
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); await tick()
    assert.notEqual(worker.messages.at(-1).epoch, old.epoch)
    camera.stop()
    let resolve
    devices.getUserMedia = () => new Promise(r => { resolve = r })
    const pending = camera.start(); camera.stop(); resolve(stream); await pending
    assert.equal(track.stopped, 2)
  })
})

test('thread camera denied permission resolves cleanly without a worker or stream', async () => {
  await browserTest(async ({ create, devices, worker, video }) => {
    devices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError') }
    const camera = create(); await camera.start()
    assert.equal(camera.getDiagnostics().camera, false)
    assert.equal(camera.getDiagnostics().error, 'Denied')
    assert.equal(video.srcObject, null); assert.equal(worker.messages.length, 0)
  })
})
