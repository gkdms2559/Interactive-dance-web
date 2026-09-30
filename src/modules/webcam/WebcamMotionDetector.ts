import { FrameDifference, quietMotion } from './FrameDifference.ts'
import type { MotionSample } from './FrameDifference.ts'

const WIDTH = 96
const HEIGHT = 72
const SAMPLE_INTERVAL = 1000 / 12

export interface WebcamDiagnostics {
  camera: 'active' | 'inactive' | 'denied'
  video: 'ready' | 'waiting'
  phase: string
  error: string | null
  getUserMediaCalls: number
  playCalls: number
  loopTicks: number
  readyState: number
  videoWidth: number
  videoHeight: number
  currentTime: number
  streamConnected: boolean
  frameAgeMs: number | null
  analysis: ReturnType<FrameDifference['getDiagnostics']>
}

/** Owns an undisplayed video and analysis canvas, including stream cleanup. */
export class WebcamMotionDetector {
  private readonly onMotion: (sample: MotionSample) => void
  private readonly difference = new FrameDifference(WIDTH, HEIGHT)
  private readonly video = document.createElement('video')
  private readonly context: CanvasRenderingContext2D
  private stream: MediaStream | undefined
  private frameId = 0
  private generation = 0
  private active = false
  private lastSample = 0
  private lastVideoTime = -1
  private lastFreshFrame = 0
  private warmupUntil = 0
  private camera: WebcamDiagnostics['camera'] = 'inactive'
  private phase = 'idle'
  private error: string | null = null
  private getUserMediaCalls = 0
  private playCalls = 0
  private loopTicks = 0

  constructor(onMotion: (sample: MotionSample) => void) {
    this.onMotion = onMotion
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Motion analysis requires Canvas 2D')
    this.context = context
    this.video.muted = true
    this.video.playsInline = true
    // Neither element is attached to the document.
  }

  async start(): Promise<void> {
    if (this.active) return
    this.error = null
    if (!navigator.mediaDevices?.getUserMedia) {
      this.camera = 'inactive'
      this.phase = 'unavailable'
      this.error = 'getUserMedia unavailable (requires HTTPS or localhost)'
      this.onMotion(quietMotion())
      console.warn('Webcam unavailable; continuing with idle animation.')
      return
    }
    this.active = true
    this.camera = 'inactive'
    this.phase = 'requesting-permission'
    const generation = ++this.generation
    try {
      this.getUserMediaCalls++
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 24 },
        },
      })
      // Permission can resolve after navigation or hot-module disposal.
      if (!this.active || generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      this.stream = stream
      this.camera = 'active'
      this.phase = 'stream-connected'
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', this.onEnded))
      this.video.srcObject = stream
      this.phase = 'waiting-for-play'
      this.playCalls++
      await this.video.play()
      if (!this.active || generation !== this.generation) return
      this.phase = 'playing'
      document.addEventListener('visibilitychange', this.onVisibility)
      this.onVisibility()
    } catch (error) {
      if (generation !== this.generation) return
      const permissionRequestFailed = this.phase === 'requesting-permission'
      this.stop()
      const name = error instanceof Error ? error.name : 'UnknownError'
      this.camera = permissionRequestFailed && (name === 'NotAllowedError' || name === 'PermissionDeniedError')
        ? 'denied' : 'inactive'
      this.phase = this.camera === 'denied' ? 'permission-denied' : 'error'
      this.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      console.warn('Webcam could not start; continuing with idle animation.', error)
    }
  }

  stop(): void {
    this.active = false
    this.generation++
    cancelAnimationFrame(this.frameId)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.stream?.getTracks().forEach((track) => {
      track.removeEventListener('ended', this.onEnded)
      track.stop()
    })
    this.stream = undefined
    this.video.pause()
    this.video.srcObject = null
    this.camera = 'inactive'
    this.phase = 'stopped'
    this.lastVideoTime = -1
    this.difference.reset()
    this.onMotion(quietMotion())
  }

  getDiagnostics(): WebcamDiagnostics {
    const frameAgeMs = this.lastVideoTime < 0 ? null : Math.max(0, performance.now() - this.lastFreshFrame)
    return {
      camera: this.camera,
      video: this.active && !document.hidden && this.hasFrame() && frameAgeMs !== null && frameAgeMs < 600
        ? 'ready' : 'waiting',
      phase: this.phase, error: this.error,
      getUserMediaCalls: this.getUserMediaCalls, playCalls: this.playCalls, loopTicks: this.loopTicks,
      readyState: this.video.readyState, videoWidth: this.video.videoWidth, videoHeight: this.video.videoHeight,
      currentTime: this.video.currentTime,
      streamConnected: this.stream !== undefined && this.video.srcObject === this.stream,
      frameAgeMs, analysis: this.difference.getDiagnostics(),
    }
  }

  private hasFrame(): boolean {
    return this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0
  }

  private readonly onEnded = () => this.stop()

  private readonly onVisibility = () => {
    cancelAnimationFrame(this.frameId)
    this.difference.reset()
    this.lastVideoTime = -1
    this.lastSample = 0
    this.lastFreshFrame = performance.now()
    this.warmupUntil = this.lastFreshFrame + 700
    this.phase = document.hidden ? 'hidden' : 'warming-up'
    this.onMotion(quietMotion())
    this.stream?.getVideoTracks().forEach((track) => { track.enabled = !document.hidden })
    if (this.active && !document.hidden) this.frameId = requestAnimationFrame(this.sample)
  }

  private readonly sample = (timestamp: number) => {
    if (!this.active || document.hidden) return
    this.loopTicks++
    if (timestamp - this.lastSample >= SAMPLE_INTERVAL) {
      this.lastSample = timestamp
      try {
        if (this.hasFrame() && this.video.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = this.video.currentTime
          this.lastFreshFrame = timestamp
          this.context.drawImage(this.video, 0, 0, WIDTH, HEIGHT)
          const pixels = this.context.getImageData(0, 0, WIDTH, HEIGHT).data
          const motion = this.difference.analyze(pixels)
          this.phase = timestamp < this.warmupUntil ? 'warming-up' : 'sampling'
          this.onMotion(timestamp < this.warmupUntil ? quietMotion() : motion)
        } else if (timestamp - this.lastFreshFrame > 600) {
          // A frozen/disconnected feed must not hold the entity in excitement.
          this.difference.reset()
          this.phase = 'waiting-for-frames'
          this.onMotion(quietMotion())
        }
      } catch (error) {
        this.stop()
        this.phase = 'analysis-error'
        this.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        console.warn('Motion sampling stopped; continuing with idle animation.', error)
        return
      }
    }
    this.frameId = requestAnimationFrame(this.sample)
  }
}
