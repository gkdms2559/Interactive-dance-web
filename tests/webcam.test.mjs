import assert from 'node:assert/strict'
import { test } from 'node:test'
import { WebcamMotionDetector } from '../src/modules/webcam/WebcamMotionDetector.ts'

async function withBrowser(run) {
  const descriptors = new Map()
  const replace = (key, value) => {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  const track = Object.assign(new EventTarget(), {
    enabled: true,
    stopCount: 0,
    stop() { this.stopCount++ },
  })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const video = {
    srcObject: null, play: async () => {}, pause() {},
    readyState: 4, videoWidth: 96, videoHeight: 72, currentTime: 0,
  }
  const context = {
    pixels: new Uint8ClampedArray(96 * 72 * 4),
    draws: 0,
    drawImage() { this.draws++ },
    getImageData() { return { data: this.pixels } },
  }
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    createElement: (tag) => tag === 'video' ? video : { getContext: () => context },
  })
  const frames = new Map()
  let frameId = 0
  let timestamp = performance.now()
  const tick = (fresh = true) => {
    timestamp += 100
    if (fresh) video.currentTime += 0.1
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(timestamp))
  }
  const mediaDevices = { getUserMedia: async () => stream }
  replace('document', document)
  replace('navigator', { mediaDevices })
  replace('requestAnimationFrame', (callback) => { frames.set(++frameId, callback); return frameId })
  replace('cancelAnimationFrame', (id) => frames.delete(id))
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    await run({ track, stream, video, document, frames, mediaDevices, context, tick })
  } finally {
    console.warn = originalWarn
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

test('camera requests video only, pauses sampling while hidden, and cleans up on stop', async () => {
  await withBrowser(async ({ track, video, document, frames, mediaDevices, stream }) => {
    let constraints
    mediaDevices.getUserMedia = async (options) => { constraints = options; return stream }
    const samples = []
    const detector = new WebcamMotionDetector((motion) => samples.push(motion))
    await detector.start()
    assert.equal(constraints.audio, false)
    assert.equal(video.srcObject, stream)
    assert.equal(frames.size, 1)
    document.hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    assert.equal(track.enabled, false)
    assert.equal(frames.size, 0)
    document.hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    assert.equal(track.enabled, true)
    assert.equal(frames.size, 1)
    detector.stop()
    assert.equal(track.stopCount, 1)
    assert.equal(video.srcObject, null)
    assert.equal(frames.size, 0)
    assert.equal(samples.at(-1).intensity, 0)
    document.dispatchEvent(new Event('visibilitychange'))
    assert.equal(frames.size, 0)
  })
})

test('permission resolving after disposal releases the late stream', async () => {
  await withBrowser(async ({ track, stream, video, frames, mediaDevices }) => {
    let grant
    mediaDevices.getUserMedia = () => new Promise((resolve) => { grant = resolve })
    const detector = new WebcamMotionDetector(() => {})
    const starting = detector.start()
    detector.stop()
    grant(stream)
    await starting
    assert.equal(track.stopCount, 1)
    assert.equal(video.srcObject, null)
    assert.equal(frames.size, 0)
  })
})

test('denied permission leaves idle without rejection; track loss releases an active camera', async () => {
  await withBrowser(async ({ track, stream, frames, mediaDevices }) => {
    const samples = []
    const detector = new WebcamMotionDetector((motion) => samples.push(motion))
    mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError') }
    await detector.start()
    assert.equal(samples.at(-1).intensity, 0)
    assert.equal(detector.getDiagnostics().camera, 'denied')
    assert.equal(frames.size, 0)
    mediaDevices.getUserMedia = async () => stream
    await detector.start()
    track.dispatchEvent(new Event('ended'))
    assert.equal(track.stopCount, 1)
    assert.equal(frames.size, 0)
    assert.equal(samples.at(-1).intensity, 0)
  })
})

test('analysis waits for dimensions, compares real successive pixels, and reports a stalled feed', async () => {
  await withBrowser(async ({ video, context, tick, frames }) => {
    const samples = []
    const detector = new WebcamMotionDetector((motion) => samples.push(motion))
    await detector.start()
    video.videoWidth = 0
    for (let i = 0; i < 10; i++) tick()
    assert.equal(context.draws, 0)
    assert.equal(detector.getDiagnostics().video, 'waiting')
    video.videoWidth = 96
    context.pixels.fill(70)
    tick()
    assert.equal(samples.at(-1).intensity, 0)
    for (let y = 16; y < 58; y++) for (let x = 10; x < 34; x++) {
      const offset = (y * 96 + x) * 4
      context.pixels.fill(80, offset, offset + 3)
    }
    tick()
    assert.ok(samples.at(-1).intensity > 0.1)
    assert.ok(detector.getDiagnostics().analysis.comparisons > 0)
    const draws = context.draws
    for (let i = 0; i < 10; i++) tick(false)
    assert.equal(context.draws, draws)
    assert.equal(samples.at(-1).intensity, 0)
    assert.equal(detector.getDiagnostics().phase, 'waiting-for-frames')
    assert.ok(detector.getDiagnostics().loopTicks >= 22)
    assert.equal(frames.size, 1)
    detector.stop()
  })
})

test('diagnostics distinguish waiting for play from missing API and analysis errors', async () => {
  await withBrowser(async ({ video, tick, context }) => {
    let playReady
    video.play = () => new Promise((resolve) => { playReady = resolve })
    const detector = new WebcamMotionDetector(() => {})
    const starting = detector.start()
    await Promise.resolve()
    assert.equal(detector.getDiagnostics().phase, 'waiting-for-play')
    assert.equal(detector.getDiagnostics().streamConnected, true)
    assert.equal(detector.getDiagnostics().playCalls, 1)
    playReady()
    await starting
    context.getImageData = () => { throw new Error('Frame read failure') }
    tick()
    assert.equal(detector.getDiagnostics().camera, 'inactive')
    assert.equal(detector.getDiagnostics().phase, 'analysis-error')
    assert.match(detector.getDiagnostics().error, /Frame read failure/)
    delete navigator.mediaDevices
    await detector.start()
    assert.equal(detector.getDiagnostics().phase, 'unavailable')
  })
})
