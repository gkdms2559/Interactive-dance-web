export interface HandInfluence {
  /** Unit vector from the entity center toward the hand, in screen coordinates. */
  x: number
  y: number
  /** Center-to-wrist distance in CSS pixels, never normalized or capped. */
  distance: number
  arm?: { shoulder: { x: number; y: number }; elbow: { x: number; y: number } | null }
  target: { x: number; y: number }
  reachAmount: number
  activity: number
  speed: number
}

export interface PoseInfluence {
  viewport: { width: number; height: number }
  left: HandInfluence | null
  right: HandInfluence | null
  headTarget?: { x: number; y: number } | null
  head: { x: number; y: number }
}

export const emptyInfluence = (): PoseInfluence => ({
  viewport: { width: 1200, height: 900 }, left: null, right: null, head: { x: 0, y: 0 },
})

/** Full attention within 20 degrees, smoothly fading to zero by 70 degrees. */
export function handAffinity(angle: number, hand: HandInfluence): number {
  const difference = Math.abs(Math.atan2(
    Math.sin(Math.atan2(hand.y, hand.x) - angle),
    Math.cos(Math.atan2(hand.y, hand.x) - angle),
  ))
  const t = Math.min(1, Math.max(0, (difference - Math.PI / 9) / (Math.PI * 5 / 18)))
  return 1 - t * t * (3 - 2 * t)
}
