import { BLACK_CONFIG as C, clamp, smooth } from './config.ts'
import type { Point } from './config.ts'
import type { TrackedPose } from '../../modules/pose/types.ts'

export type IntroState = 'INTRO' | 'DOOR_OPEN' | 'APPROACHING_DOOR' | 'ENTERING_DOOR' | 'WHITE_TRANSITION' | 'INTRO_COMPLETE'
export class IntroSequence {
  state: IntroState = 'INTRO'
  activity = 0
  private motion = 0
  private sampleAge = Infinity
  private lastTimestamp = -Infinity
  private previous: { left: Point | null; right: Point | null } = { left: null, right: null }
  private width = 1200
  private height = 900
  private time = 0
  private position: Point | null = null
  private departure: Point | null = null
  private travelDuration = 1
  resize(width: number, height: number): void {
    for (const p of [this.position, this.departure]) if (p) { p.x *= width / this.width; p.y *= height / this.height }
    this.width = width; this.height = height
  }
  receive(pose: TrackedPose, timestamp: number): void {
    if (this.state !== 'INTRO' || timestamp <= this.lastTimestamp) return
    const delta = (timestamp - this.lastTimestamp) / 1000
    this.lastTimestamp = timestamp; this.sampleAge = 0
    let amount = 0
    for (const side of ['left', 'right'] as const) {
      const point = side === 'left' ? pose.leftWrist : pose.rightWrist
      const old = this.previous[side]
      if (point && old && delta > 0 && delta < 0.5) {
        const speed = Math.hypot((point.x - old.x) * this.width, (point.y - old.y) * this.height)
          / Math.hypot(this.width, this.height) / delta
        amount = Math.max(amount, clamp((speed - C.ACTIVITY_DEADZONE) / 0.35, 0, 1))
      }
      this.previous[side] = point ? { x: point.x, y: point.y } : null
    }
    this.motion = amount
  }
  door() {
    const factor = Math.min(1, this.width / 500, this.height / 400)
    return { x: this.width * C.DOOR_POSITION.x, y: this.height * C.DOOR_POSITION.y,
      width: C.DOOR_SIZE.width * factor, height: C.DOOR_SIZE.height * factor }
  }
  update(seconds: number, core: Point): void {
    const dt = clamp(seconds, 0, 0.05)
    this.time += dt; this.sampleAge += dt
    if (this.state === 'INTRO') {
      const motion = this.sampleAge < 0.25 ? this.motion : 0
      this.activity = clamp(this.activity + (motion * C.ACTIVITY_GAIN - (motion < 0.05 ? C.ACTIVITY_DECAY : 0)) * dt, 0, C.ACTIVITY_THRESHOLD)
      if (this.activity >= C.ACTIVITY_THRESHOLD) {
        this.state = 'DOOR_OPEN'; this.time = 0; this.position = { ...core }
      }
    } else if (this.state === 'DOOR_OPEN' && this.time >= C.DOOR_OPEN_DURATION) {
      this.state = 'APPROACHING_DOOR'; this.time = 0; this.departure = { ...this.position! }
      const door = this.door()
      this.travelDuration = clamp(Math.hypot(door.x - core.x, door.y - core.y) / C.DOOR_TRAVEL_SPEED, 0.8, 3.8)
    } else if (this.state === 'APPROACHING_DOOR') {
      const door = this.door(), t = smooth(this.time / this.travelDuration)
      this.position = { x: this.departure!.x + (door.x - this.departure!.x) * t,
        y: this.departure!.y + (door.y - this.departure!.y) * t }
      if (this.time >= this.travelDuration) { this.state = 'ENTERING_DOOR'; this.time = 0 }
    } else if (this.state === 'ENTERING_DOOR' && this.time >= C.CORE_ENTER_DURATION) {
      this.state = 'WHITE_TRANSITION'; this.time = 0
    } else if (this.state === 'WHITE_TRANSITION' && this.time >= C.WHITE_TRANSITION_DURATION) {
      this.state = 'INTRO_COMPLETE'; this.time = 0
    }
  }
  presentation() {
    const entering = this.state === 'ENTERING_DOOR' ? smooth(this.time / C.CORE_ENTER_DURATION)
      : this.state === 'WHITE_TRANSITION' || this.state === 'INTRO_COMPLETE' ? 1 : 0
    return { position: this.position ? { ...this.position } : null, scale: 1 - entering * 0.94,
      alpha: 1 - entering, glow: this.state === 'DOOR_OPEN' ? Math.sin(Math.min(1, this.time / C.DOOR_OPEN_DURATION) * Math.PI) * 0.65 : entering * 0.6,
      retract: this.state === 'INTRO' ? 0 : this.state === 'DOOR_OPEN' ? smooth(this.time / C.DOOR_OPEN_DURATION) : 1 }
  }
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'INTRO') return
    ctx.save(); ctx.fillStyle = '#ffffff'
    if (this.state === 'INTRO_COMPLETE') { ctx.fillRect(0, 0, this.width, this.height); ctx.restore(); return }
    const door = this.door()
    const opening = this.state === 'DOOR_OPEN' ? smooth(this.time / C.DOOR_OPEN_DURATION) : 1
    const w = door.width * opening, top = door.y - door.height / 2, bottom = door.y + door.height / 2
    // A hinged black plane reveals a white slit and a short trapezoid of spill below it.
    ctx.beginPath(); ctx.moveTo(door.x - w / 2, top); ctx.lineTo(door.x + w / 2, top + (1 - opening) * 12)
    ctx.lineTo(door.x + w / 2, bottom); ctx.lineTo(door.x - w / 2, bottom); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 0.12 * opening
    ctx.beginPath(); ctx.moveTo(door.x - w / 2, bottom); ctx.lineTo(door.x + w / 2, bottom)
    ctx.lineTo(door.x + w * 1.6, bottom + door.height * 0.5); ctx.lineTo(door.x - w * 0.9, bottom + door.height * 0.5)
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1
    ctx.fillStyle = '#000000'
    ctx.beginPath(); ctx.moveTo(door.x + w / 2, top); ctx.lineTo(door.x + w * .16, top + door.height * .1)
    ctx.lineTo(door.x + w * .16, bottom - door.height * .1); ctx.lineTo(door.x + w / 2, bottom)
    ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffffff'

    if (this.state === 'WHITE_TRANSITION') {
      const farthest = Math.max(...[[0, 0], [this.width, 0], [0, this.height], [this.width, this.height]]
        .map(([x, y]) => Math.hypot(x! - door.x, y! - door.y)))
      const radius = smooth(this.time / C.WHITE_TRANSITION_DURATION) * (farthest + 2)
      ctx.beginPath(); ctx.arc(door.x, door.y, radius, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
}
