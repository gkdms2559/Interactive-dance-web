import { noPose } from './types.ts'
import type { PoseLandmarks, TrackedPoint, TrackedPose } from './types.ts'

/** Confidence filtering, mirror mapping and time-based landmark velocity. */
export class PoseTracker {
  private pose = noPose()
  private timestamp: number | undefined

  reset(): TrackedPose {
    this.pose = noPose()
    this.timestamp = undefined
    return this.snapshot()
  }

  snapshot(): TrackedPose {
    return {
      detected: this.pose.detected,
      imageAspect: this.pose.imageAspect,
      nose: this.pose.nose && { ...this.pose.nose },
      leftShoulder: this.pose.leftShoulder && { ...this.pose.leftShoulder },
      rightShoulder: this.pose.rightShoulder && { ...this.pose.rightShoulder },
      leftElbow: this.pose.leftElbow && { ...this.pose.leftElbow },
      rightElbow: this.pose.rightElbow && { ...this.pose.rightElbow },
      leftWrist: this.pose.leftWrist && { ...this.pose.leftWrist },
      rightWrist: this.pose.rightWrist && { ...this.pose.rightWrist },
    }
  }

  receive(landmarks: PoseLandmarks, timestamp: number, width: number, height: number): TrackedPose {
    if (!Number.isFinite(timestamp) || (this.timestamp !== undefined && timestamp <= this.timestamp)) return this.snapshot()
    const delta = this.timestamp === undefined ? 0 : (timestamp - this.timestamp) / 1000
    this.timestamp = timestamp
    const next = noPose()
    next.imageAspect = Number.isFinite(landmarks.imageAspect) && landmarks.imageAspect! > 0 ? landmarks.imageAspect! : 1
    for (const key of ['nose', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'] as const) {
      const landmark = landmarks[key]
      if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)
        || (landmark.visibility ?? 1) < 0.55 || (landmark.presence ?? 1) < 0.55
        || landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) continue
      const previous = delta > 0 && delta < 0.5 ? this.pose[key] : null
      const x = 1 - landmark.x
      const y = landmark.y
      const point: TrackedPoint = { x, y, speed: 0 }
      if (previous) {
        const pixelChange = Math.hypot((x - previous.x) * width, (y - previous.y) * height)
        // Only sub-two-pixel jitter gets stronger filtering; intentional motion has no trailing envelope.
        const follow = 1 - Math.exp(-delta / (pixelChange < 2 ? 0.065 : 0.015))
        point.x = previous.x + (x - previous.x) * follow
        point.y = previous.y + (y - previous.y) * follow
        const distance = Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height)
          / Math.max(1, Math.hypot(width, height))
        const velocity = Math.max(0, Math.min(3, distance / delta) - 0.025)
        point.speed = previous.speed + (velocity - previous.speed) * (1 - Math.exp(-delta / 0.12))
      }
      next[key] = point
    }
    next.detected = Boolean(next.nose || next.leftWrist || next.rightWrist)
    this.pose = next
    return this.snapshot()
  }
}
