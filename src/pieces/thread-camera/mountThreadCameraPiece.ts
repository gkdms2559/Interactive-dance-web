import { THREAD_CONFIG as C } from './config'
import { HandCamera } from './HandCamera'
import { PalmTracker } from './PalmTracker'
import { DustSystem } from './DustSystem'
import { drawThread } from './ThreadRenderer'

export function mountThreadCameraPiece(host: HTMLElement): () => void {
  const root = document.createElement('div'); root.className = 'thread-camera'
  const video = document.createElement('video')
  video.className = 'thread-camera-video'
  video.style.transform = C.CAMERA_MIRROR ? 'scaleX(-1)' : 'none'
  const canvas = document.createElement('canvas'); canvas.className = 'thread-camera-overlay'
  root.append(video, canvas); host.replaceChildren(root)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  const palms = new PalmTracker(), dust = new DustSystem()
  let width = 1, height = 1, ratio = 1, frame = 0, previous: number | undefined, disposed = false
  const reset = () => { palms.reset(); dust.reset(); ctx.clearRect(0, 0, width, height) }
  const camera = new HandCamera(video, result => {
    if (!disposed) palms.receive(result, performance.now() / 1000, width, height)
  }, reset, {
    wasmRoot: new URL(`${import.meta.env.BASE_URL}mediapipe/wasm`, document.baseURI).href,
    modelUrl: new URL(`${import.meta.env.BASE_URL}models/hand_landmarker.task`, document.baseURI).href,
  })
  const resize = () => {
    const bounds = root.getBoundingClientRect()
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height)
    ratio = Math.min(C.PIXEL_RATIO_CAP, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    dust.reset() // Ephemeral dust has no history to rescale; palm mapping uses the current cover bounds.
  }
  const tick = (now: number) => {
    if (disposed || document.hidden) return
    if (ratio !== Math.min(C.PIXEL_RATIO_CAP, window.devicePixelRatio || 1)) resize()
    const dt = previous === undefined ? 1 / 60 : Math.min(0.05, (now - previous) / 1000)
    previous = now
    const thread = palms.update(dt, now / 1000, width, height)
    dust.update(dt, thread)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    dust.draw(ctx); drawThread(ctx, thread)
    frame = requestAnimationFrame(tick)
  }
  const visibility = () => {
    cancelAnimationFrame(frame); previous = undefined
    if (!document.hidden && !disposed) frame = requestAnimationFrame(tick)
  }
  const start = () => { if (!disposed) void camera.start() }
  const stop = () => camera.stop()
  const observer = new ResizeObserver(resize); observer.observe(root)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', stop); window.addEventListener('pageshow', start)
  const debug = C.DEBUG ? window.setInterval(() => console.debug('Thread camera', camera.getDiagnostics(), { particles: dust.count }), 2000) : undefined
  resize(); visibility(); start()
  return () => {
    if (disposed) return
    disposed = true; camera.stop(); cancelAnimationFrame(frame); observer.disconnect()
    clearInterval(debug)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', start)
    root.remove()
  }
}
