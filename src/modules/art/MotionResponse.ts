import type { DesireState } from '../../entities/DesireEntity.ts'
import type { MotionSample } from '../webcam/FrameDifference.ts'
import { quietMotion } from '../webcam/FrameDifference.ts'

/** A soft greeting envelope: open gradually, linger, then settle over seconds. */
export class MotionResponse {
  private sample = quietMotion()
  private activity = 0
  private hold = 0
  private sampleAge = Infinity
  private direction = { x: 0, y: 0 }

  receive(sample: MotionSample): void {
    this.sample = sample
    this.sampleAge = 0
  }

  getDiagnostics(): { raw: number; smoothed: number; sampleAge: number } {
    return {
      raw: this.sampleAge < 0.65 ? this.sample.intensity : 0,
      smoothed: this.activity,
      sampleAge: this.sampleAge,
    }
  }

  update(deltaSeconds: number): DesireState {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0
    this.sampleAge += delta
    const input = this.sampleAge < 0.65 ? this.sample.intensity : 0
    const intensity = Number.isFinite(input) ? Math.min(1, Math.max(0, input)) : 0
    if (intensity > 0.025) this.hold = 0.25
    else this.hold = Math.max(0, this.hold - delta)

    const desired = intensity > 0 ? intensity ** 0.72 : 0
    const target = desired === 0 && this.hold > 0 ? this.activity : desired
    const timeConstant = target > this.activity ? 0.24 : 0.85
    this.activity += (target - this.activity) * (1 - Math.exp(-delta / timeConstant))
    for (const axis of ['x', 'y'] as const) {
      const rawDirection = this.sample.direction[axis]
      const targetDirection = intensity > 0.025 && Number.isFinite(rawDirection)
        ? Math.min(1, Math.max(-1, rawDirection)) : 0
      this.direction[axis] += (targetDirection - this.direction[axis]) * (1 - Math.exp(-delta / 0.4))
    }

    return {
      energy: 0.18 + this.activity * 0.55,
      expansion: this.activity * 0.9,
      excitement: 0.04 + this.activity * 0.8,
      motionDirection: {
        x: this.direction.x * this.activity,
        y: this.direction.y * this.activity,
      },
    }
  }
}
