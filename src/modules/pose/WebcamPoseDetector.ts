import type { PoseLandmarks, PoseWorkerReply, PoseWorkerRequest } from './types.ts'

export interface PoseDiagnostics {
  camera: 'active' | 'inactive' | 'denied'
  video: 'ready' | 'waiting'
  model: 'loading' | 'ready' | 'inactive' | 'error'
  error: string | null
  inferences: number
  inferenceMs: number
}

interface PoseWorker {
  onmessage: ((event: MessageEvent<PoseWorkerReply>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: PoseWorkerRequest, transfer?: Transferable[]): void
  terminate(): void
}

interface PoseDetectorOptions {
  wasmRoot: string
  modelUrl: string
  createWorker?: () => PoseWorker
}

const emptyLandmarks = (): PoseLandmarks => ({
  nose: null, leftShoulder: null, rightShoulder: null, leftWrist: null, rightWrist: null,
})

/** One bitmap in flight, independent of the Canvas RAF, capped at 15 inferences/s. */
export class WebcamPoseDetector {
  private readonly video = document.createElement('video')
  private readonly onPose: (landmarks: PoseLandmarks, timestamp: number) => void
  private readonly options: PoseDetectorOptions
  private stream: MediaStream | undefined
  private worker: PoseWorker | undefined
  private active = false
  private ready = false
  private busy = false
  private generation = 0
  private epoch = 0
  private frameId = 0
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private lastSample = 0
  private lastVideoTime = -1
  private lastResult = 0
  private lastFrame = 0
  private diagnostics: PoseDiagnostics = {
    camera: 'inactive', video: 'waiting', model: 'inactive', error: null, inferences: 0, inferenceMs: 0,
  }

  constructor(onPose: (landmarks: PoseLandmarks, timestamp: number) => void, options: PoseDetectorOptions) {
    this.onPose = onPose
    this.options = options
    this.video.muted = true
    this.video.playsInline = true
  }

  getDiagnostics(): PoseDiagnostics { return { ...this.diagnostics } }

  async start(): Promise<void> {
    if (this.active) return
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail('Camera unavailable; HTTPS or localhost is required')
      return
    }
    this.active = true
    const generation = ++this.generation
    this.diagnostics.error = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
      })
      if (!this.active || generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.stream = stream
      this.diagnostics.camera = 'active'
      stream.getTracks().forEach((track) => track.addEventListener('ended', this.onEnded))
      this.video.srcObject = stream
      await this.video.play()
      if (!this.active || generation !== this.generation) return
      this.diagnostics.model = 'loading'
      const worker = this.options.createWorker?.()
        ?? new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
      this.worker = worker
      worker.onmessage = ({ data }) => {
        if (!this.active || generation !== this.generation) return
        if (data.type === 'error') { this.fail(data.message); return }
        if (data.type === 'ready') {
          clearTimeout(this.watchdog)
          this.ready = true
          this.diagnostics.model = 'ready'
          return
        }
        clearTimeout(this.watchdog)
        this.busy = false
        if (data.epoch !== this.epoch || document.hidden) return
        this.lastResult = performance.now()
        this.diagnostics.inferences++
        this.diagnostics.inferenceMs = data.inferenceMs
        this.onPose(data.landmarks, data.timestamp)
      }
      worker.onerror = (event) => {
        if (this.active && generation === this.generation) this.fail(event.message || 'Pose worker failed')
      }
      worker.postMessage({ type: 'init', wasmRoot: this.options.wasmRoot, modelUrl: this.options.modelUrl })
      this.watchdog = setTimeout(() => this.fail('Pose model loading timed out'), 45000)
      document.addEventListener('visibilitychange', this.onVisibility)
      this.onVisibility()
    } catch (error) {
      if (generation !== this.generation) return
      const denied = error instanceof Error && error.name === 'NotAllowedError'
      this.fail(error instanceof Error ? error.message : String(error), denied)
    }
  }

  stop(): void {
    this.active = false
    this.generation++
    this.epoch++
    cancelAnimationFrame(this.frameId)
    clearTimeout(this.watchdog)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.worker?.terminate()
    this.worker = undefined
    this.stream?.getTracks().forEach((track) => {
      track.removeEventListener('ended', this.onEnded)
      track.stop()
    })
    this.stream = undefined
    this.video.pause()
    this.video.srcObject = null
    this.ready = false
    this.busy = false
    this.diagnostics = { ...this.diagnostics, camera: 'inactive', video: 'waiting', model: 'inactive' }
    this.onPose(emptyLandmarks(), performance.now())
  }

  private fail(message: string, denied = false): void {
    this.stop()
    this.diagnostics = { ...this.diagnostics, camera: denied ? 'denied' : 'inactive', model: 'error', error: message }
    console.warn('Pose tracking unavailable; continuing with idle animation.', message)
  }

  private readonly onEnded = () => this.stop()

  private readonly onVisibility = () => {
    cancelAnimationFrame(this.frameId)
    this.epoch++
    this.lastSample = 0
    this.lastVideoTime = -1
    this.lastResult = performance.now()
    this.lastFrame = this.lastResult
    this.diagnostics.video = 'waiting'
    this.onPose(emptyLandmarks(), performance.now())
    this.stream?.getVideoTracks().forEach((track) => { track.enabled = !document.hidden })
    if (this.active && !document.hidden) this.frameId = requestAnimationFrame(this.sample)
  }

  private readonly sample = (timestamp: number) => {
    if (!this.active || document.hidden) return
    if (this.ready && !this.busy && timestamp - this.lastSample >= 1000 / 15
      && this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0
      && this.video.currentTime !== this.lastVideoTime) {
      this.lastSample = timestamp
      this.lastVideoTime = this.video.currentTime
      this.lastFrame = timestamp
      this.diagnostics.video = 'ready'
      this.busy = true
      const generation = this.generation
      const epoch = this.epoch
      // Transfer ownership; never queue another image while this one is being processed.
      void createImageBitmap(this.video, {
        resizeWidth: Math.min(640, this.video.videoWidth),
        resizeHeight: Math.round(this.video.videoHeight * Math.min(1, 640 / this.video.videoWidth)),
      }).then((bitmap) => {
        if (generation !== this.generation || !this.worker || epoch !== this.epoch) {
          bitmap.close()
          if (generation === this.generation) this.busy = false
          return
        }
        try {
          this.worker.postMessage({ type: 'frame', bitmap, timestamp, epoch }, [bitmap])
          this.watchdog = setTimeout(() => this.fail('Pose inference timed out'), 5000)
        } catch (error) { bitmap.close(); throw error }
      }).catch((error: unknown) => {
        if (generation === this.generation) this.fail(error instanceof Error ? error.message : String(error))
      })
    }
    if (timestamp - this.lastFrame > 600) this.diagnostics.video = 'waiting'
    if (timestamp - this.lastResult > 500) {
      this.lastResult = timestamp
      this.onPose(emptyLandmarks(), timestamp)
    }
    this.frameId = requestAnimationFrame(this.sample)
  }
}
