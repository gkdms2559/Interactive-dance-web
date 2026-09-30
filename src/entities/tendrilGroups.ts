export type HandSide = 'left' | 'right'
export type TendrilRole = 'primary' | 'secondary'

interface Candidate { angle: number; owner: HandSide | null; role: TendrilRole | null }
export interface TendrilGroup { side: HandSide; role: TendrilRole; fraction: number }

/** Exclusive assignment: 2 primary + 3 secondary per hand, with angular hysteresis. */
export function selectTendrilGroups(
  fibers: Candidate[], angles: Partial<Record<HandSide, number>>, secondaryCount = 3,
): Map<number, TendrilGroup> {
  const selected = new Map<number, TendrilGroup>()
  for (let rank = 0; rank < 2 + secondaryCount; rank++) for (const side of ['left', 'right'] as const) {
    const angle = angles[side]
    if (angle === undefined) continue
    const role = rank < 2 ? 'primary' : 'secondary'
    const candidates = fibers.map((fiber, index) => {
      const difference = Math.abs(Math.atan2(Math.sin(fiber.angle - angle), Math.cos(fiber.angle - angle)))
      return { index, difference, score: difference - (fiber.owner === side && fiber.role === role ? 0.15 : 0) }
    }).filter(({ index, difference }) => !selected.has(index) && difference < Math.PI * 0.6)
      .sort((a, b) => a.score - b.score)
    const best = candidates[0]
    if (best) selected.set(best.index, { side, role, fraction: ([0.97, 0.9, 0.77, 0.65, 0.55][rank] ?? Math.max(0.25, 0.5 - (rank - 5) * 0.07)) })
  }
  return selected
}

/** Substepped, slightly underdamped spring: ~100–200ms follow, a small settling motion. */
export function springPoint(
  point: { x: number; y: number; vx: number; vy: number }, target: { x: number; y: number }, delta: number,
): void {
  const steps = Math.max(1, Math.ceil(delta * 120))
  const dt = delta / steps
  for (let i = 0; i < steps; i++) {
    point.vx += ((target.x - point.x) * 24 ** 2 - point.vx * 38.4) * dt
    point.vy += ((target.y - point.y) * 24 ** 2 - point.vy * 38.4) * dt
    point.x += point.vx * dt
    point.y += point.vy * dt
  }
}
