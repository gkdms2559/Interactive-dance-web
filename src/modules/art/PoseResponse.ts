import type { DesireState } from '../../entities/DesireEntity.ts'
import { emptyInfluence } from '../../entities/PoseInfluence.ts'
import type { HandInfluence, PoseInfluence } from '../../entities/PoseInfluence.ts'
import { noPose } from '../pose/types.ts'
import type { TrackedPose } from '../pose/types.ts'
import { calculateReach } from '../pose/reachAmount.ts'

/** Independent envelopes preserve two opposing hands instead of averaging them away. */
export class PoseResponse {
  private pose = noPose()
  private age = Infinity
  private activity = { leftWrist: 0, rightWrist: 0 }
  private presence = { leftWrist: 0, rightWrist: 0 }
  private reach = { leftWrist: 0, rightWrist: 0 }
  private hands: { leftWrist: HandInfluence | null; rightWrist: HandInfluence | null } = {
    leftWrist: null, rightWrist: null,
  }

  receive(pose: TrackedPose): void {
    for (const key of ['leftWrist', 'rightWrist'] as const) {
      // A small welcome on first sight; a stationary hand then settles naturally.
      if (pose[key] && !this.pose[key]) this.activity[key] = Math.max(this.activity[key], 0.3)
    }
    this.pose = pose
    this.age = 0
  }

  update(deltaSeconds: number, width: number, height: number): { state: DesireState; influence: PoseInfluence } {
    const delta = Number.isFinite(deltaSeconds) ? Math.min(0.1, Math.max(0, deltaSeconds)) : 0
    this.age += delta
    const influence = emptyInfluence()
    influence.viewport = { width, height }
    const fresh = this.age < 0.5
    for (const key of ['leftWrist', 'rightWrist'] as const) {
      const point = fresh ? this.pose[key] : null
      const reachTarget = point ? calculateReach(this.pose, key === 'leftWrist' ? 'left' : 'right') : 0
      this.reach[key] += (reachTarget - this.reach[key]) * (1 - Math.exp(-delta / (point ? 0.045 : 0.18)))
      this.presence[key] += ((point ? 1 : 0) - this.presence[key]) * (1 - Math.exp(-delta / (point ? 0.04 : 0.18)))
      const speed = point ? Math.min(1, point.speed / 0.65) : 0
      const target = speed ** 0.7
      this.activity[key] += (target - this.activity[key])
        * (1 - Math.exp(-delta / (target > this.activity[key] ? 0.18 : 0.9)))
      if (point) {
        const shoulder = this.pose[key === 'leftWrist' ? 'leftShoulder' : 'rightShoulder']
        const elbow = this.pose[key === 'leftWrist' ? 'leftElbow' : 'rightElbow']
        const dx = (point.x - 0.5) * width
        const dy = (point.y - 0.5) * height
        const distance = Math.hypot(dx, dy)
        this.hands[key] = {
          x: distance > 1 ? dx / distance : 0,
          y: distance > 1 ? dy / distance : 0,
          distance,
          arm: { shoulder: shoulder ? { x: shoulder.x * width, y: shoulder.y * height }
            : { x: (this.pose.nose?.x ?? 0.5) * width, y: (this.pose.nose?.y ?? 0.5) * height + 20 },
            elbow: elbow ? { x: elbow.x * width, y: elbow.y * height } : null },
          target: { x: point.x * width, y: point.y * height },
          reachAmount: this.reach[key],
          activity: this.presence[key], speed,
        }
      } else if (this.hands[key]) {
        this.hands[key] = { ...this.hands[key]!, reachAmount: this.reach[key], activity: this.presence[key], speed: 0 }
      }
    }
    influence.left = this.hands.leftWrist
    influence.right = this.hands.rightWrist
    influence.headTarget = fresh && this.pose.nose ? { x: this.pose.nose.x * width, y: this.pose.nose.y * height } : null
    if (fresh && this.pose.nose) {
      const engagement = Math.max(this.activity.leftWrist, this.activity.rightWrist,
        Math.min(1, this.pose.nose.speed * 2))
      influence.head = {
        x: (this.pose.nose.x - 0.5) * 2 * engagement,
        y: (this.pose.nose.y - 0.5) * 2 * engagement,
      }
    }
    const activity = Math.max(this.activity.leftWrist, this.activity.rightWrist)
    return {
      influence,
      state: {
        energy: 0.18 + activity * 0.3,
        excitement: 0.04 + activity * 0.8,
        // Hand attraction, not global expansion, supplies the visible extension.
        expansion: 0,
        motionDirection: { x: 0, y: 0 },
      },
    }
  }
}
