import { THREAD_CONFIG as C } from './config.ts'
import type { HandFrame, HandReply, HandRequest } from './config.ts'

interface WorkerPort {
  onmessage: ((event: MessageEvent<HandReply>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: HandRequest, transfer?: Transferable[]): void
  terminate(): void
}
interface Options { wasmRoot: string; modelUrl: string; createWorker?: () => WorkerPort }

/** One visible video and one camera stream. Model failures never replace the live camera image. */
export class HandCamera {
  private video: HTMLVideoElement
  private options: Options
  private onFrame: (frame: HandFrame) => void
  private onReset: () => void
  private stream: MediaStream | undefined
  private worker: WorkerPort | undefined
  private active = false
  private ready = false
  private busy = false
  private generation = 0
  private epoch = 0
  private raf = 0
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private lastSample = -Infinity
  private lastVideoTime = -1
  private error: string | null = null
  constructor(video: HTMLVideoElement, onFrame: (frame: HandFrame) => void, onReset: () => void, options: Options) {
    this.video = video; this.onFrame = onFrame; this.onReset = onReset; this.options = options
    video.muted = true; video.playsInline = true; video.autoplay = true
  }
  getDiagnostics() { return { camera: !!this.stream, modelReady: this.ready, error: this.error } }
  async start(): Promise<void> {
    if (this.active) return
    if (!navigator.mediaDevices?.getUserMedia) { this.error = 'Camera unavailable'; return }
    this.active = true; this.error = null
    const generation = ++this.generation
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } })
      if (!this.active || generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return }
      this.stream = stream
      stream.getTracks().forEach(t => t.addEventListener('ended', this.onEnded))
      this.video.srcObject = stream
      await this.video.play()
      if (!this.active || generation !== this.generation) return
      document.addEventListener('visibilitychange', this.visibility)
      this.visibility()
      const worker = this.options.createWorker?.() ?? new Worker(new URL('./hand.worker.ts', import.meta.url), { type: 'module' })
      this.worker = worker
      worker.onmessage = ({ data }) => {
        if (!this.active || this.worker !== worker || generation !== this.generation) return
        clearTimeout(this.watchdog)
        if (data.type === 'error') { this.modelFailed(data.message); return }
        if (data.type === 'ready') { this.ready = true; return }
        this.busy = false
        if (data.epoch !== this.epoch || document.hidden) return
        // Normalized coordinates survive inference downsampling; use original video aspect for cover.
        this.onFrame({ ...data, width: this.video.videoWidth, height: this.video.videoHeight })
      }
      worker.onerror = e => { if (this.worker === worker) this.modelFailed(e.message) }
      worker.postMessage({ type: 'init', wasmRoot: this.options.wasmRoot, modelUrl: this.options.modelUrl })
      this.watchdog = setTimeout(() => this.modelFailed('Hand model loading timed out'), C.MODEL_TIMEOUT_MS)
    } catch (error) {
      if (generation !== this.generation) return
      this.error = error instanceof Error ? error.message : String(error)
      if (this.stream && this.video.readyState >= 2) this.modelFailed(this.error)
      else this.stop()
    }
  }
  stop(): void {
    this.active = false; this.generation++; this.epoch++
    cancelAnimationFrame(this.raf); clearTimeout(this.watchdog)
    document.removeEventListener('visibilitychange', this.visibility)
    this.worker?.terminate(); this.worker = undefined; this.ready = false; this.busy = false
    this.stream?.getTracks().forEach(t => { t.removeEventListener('ended', this.onEnded); t.stop() })
    this.stream = undefined; this.video.pause(); this.video.srcObject = null
    this.onReset()
  }
  private modelFailed(message: string): void {
    clearTimeout(this.watchdog)
    this.error = message; this.ready = false; this.busy = false
    this.worker?.terminate(); this.worker = undefined
    // Let existing palm samples expire with their ordinary hold/fade envelope.
  }
  private onEnded = () => this.stop()
  private visibility = () => {
    cancelAnimationFrame(this.raf); this.epoch++; this.lastVideoTime = -1; this.lastSample = -Infinity
    if (this.ready && this.busy) {
      clearTimeout(this.watchdog)
      if (!document.hidden) this.watchdog = setTimeout(() => this.modelFailed('Hand frame timed out'), C.FRAME_TIMEOUT_MS)
    }
    this.onReset()
    this.stream?.getVideoTracks().forEach(t => { t.enabled = !document.hidden })
    if (this.active && !document.hidden) this.raf = requestAnimationFrame(this.sample)
  }
  private sample = (timestamp: number) => {
    if (!this.active || document.hidden) return
    if (this.ready && !this.busy && timestamp - this.lastSample >= 1000 / C.INFERENCE_FPS
      && this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0
      && this.video.currentTime !== this.lastVideoTime) {
      this.busy = true; this.lastSample = timestamp; this.lastVideoTime = this.video.currentTime
      const generation = this.generation, epoch = this.epoch, worker = this.worker
      const scale = Math.min(1, C.INFERENCE_WIDTH / this.video.videoWidth)
      this.watchdog = setTimeout(() => this.modelFailed('Hand frame timed out'), C.FRAME_TIMEOUT_MS)
      void createImageBitmap(this.video, { resizeWidth: Math.round(this.video.videoWidth * scale),
        resizeHeight: Math.round(this.video.videoHeight * scale) }).then(bitmap => {
        if (generation !== this.generation || this.worker !== worker || !worker || epoch !== this.epoch) {
          bitmap.close()
          if (generation === this.generation && this.worker === worker) { this.busy = false; clearTimeout(this.watchdog) }
          return
        }
        try { worker.postMessage({ type: 'frame', bitmap, timestamp, epoch }, [bitmap]) }
        catch (error) { bitmap.close(); throw error }
      }).catch(error => {
        if (generation === this.generation && this.worker === worker) this.modelFailed(String(error))
      })
    }
    this.raf = requestAnimationFrame(this.sample)
  }
}
