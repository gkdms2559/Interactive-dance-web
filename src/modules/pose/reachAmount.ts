import type { TrackedPose } from './types.ts'

/** Body-size invariant, using source-image proportions rather than viewport stretch. */
export function calculateReach(pose: TrackedPose, side: 'left' | 'right'): number {
  const left = pose.leftShoulder
  const right = pose.rightShoulder
  const shoulder = side === 'left' ? left : right
  const wrist = side === 'left' ? pose.leftWrist : pose.rightWrist
  if (!left || !right || !shoulder || !wrist) return 0
  const aspect = pose.imageAspect || 1
  const shoulderWidth = Math.hypot((left.x - right.x) * aspect, left.y - right.y)
  // Near-overlapping/unreliable shoulders must not generate enormous reach.
  if (shoulderWidth < Math.hypot(aspect, 1) * 0.025) return 0
  const armDistance = Math.hypot((wrist.x - shoulder.x) * aspect, wrist.y - shoulder.y)
  const t = Math.min(1, Math.max(0, (armDistance / shoulderWidth - 0.35) / 1.05))
  return t * t * (3 - 2 * t)
}
