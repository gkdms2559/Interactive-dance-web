import { THREAD_CONFIG as C } from './config.ts'
import type { HandFrame, Point, Side } from './config.ts'
import { coverPoint, palmCenter } from './coordinates.ts'

interface Palm { point: Point | null; seen: number; alpha: number; speed: number }
export interface ThreadState { left: Point | null; right: Point | null; alpha: number; speed: number }

export class PalmTracker {
  private palms: Record<Side, Palm> = {
    Left: { point: null, seen: -Infinity, alpha: 0, speed: 0 },
    Right: { point: null, seen: -Infinity, alpha: 0, speed: 0 },
  }
  private source = { width: 1, height: 1 }
  private timestamp = -Infinity
  reset(): void {
    this.timestamp = -Infinity
    for (const p of Object.values(this.palms)) { p.point = null; p.seen = -Infinity; p.alpha = 0; p.speed = 0 }
  }
  receive(frame: HandFrame, now: number, width: number, height: number): void {
    if (frame.timestamp <= this.timestamp || frame.width <= 0 || frame.height <= 0) return
    this.timestamp = frame.timestamp
    this.source = { width: frame.width, height: frame.height }
    const candidates = frame.hands.filter(h => h.confidence >= C.HAND_CONFIDENCE)
      .map(h => ({ ...h, center: palmCenter(h.points) })).filter(h => h.center !== null).slice(0, 2)
    const cost = (index: number, side: Side) => {
      const h = candidates[index]!, old = this.palms[side]
      const recent = old.point && now - old.seen < 0.5
      const distinctLabels = candidates.length === 2 && candidates[0]!.side !== candidates[1]!.side
      const spatial = recent ? Math.min(distinctLabels ? 0.12 : 0.3,
        Math.hypot(h.center!.x - old.point!.x, h.center!.y - old.point!.y)) : 0
      return spatial + (h.side === side ? 0 : 0.1 + h.confidence * 0.1)
    }
    let assignments: [number, Side][] = []
    if (candidates.length === 2) {
      assignments = cost(0, 'Left') + cost(1, 'Right') <= cost(0, 'Right') + cost(1, 'Left')
        ? [[0, 'Left'], [1, 'Right']] : [[0, 'Right'], [1, 'Left']]
    } else if (candidates.length === 1) assignments = [[0, cost(0, 'Left') <= cost(0, 'Right') ? 'Left' : 'Right']]
    for (const [index, side] of assignments) {
      const p = this.palms[side], next = candidates[index]!.center!
      const delta = now - p.seen
      if (p.point && delta > 0 && delta < 0.5) {
        const a = coverPoint(p.point, frame.width, frame.height, width, height)
        const b = coverPoint(next, frame.width, frame.height, width, height)
        const pixels = Math.hypot(b.x - a.x, b.y - a.y)
        const blend = pixels < C.PALM_JITTER_PIXELS ? 1 - Math.exp(-delta / C.PALM_SMOOTHING) : 1
        p.point = { x: p.point.x + (next.x - p.point.x) * blend, y: p.point.y + (next.y - p.point.y) * blend }
        p.speed = Math.min(1600, pixels / delta)
      } else { p.point = { ...next }; p.speed = 0 }
      p.seen = now
    }
  }
  update(dt: number, now: number, width: number, height: number): ThreadState {
    for (const p of Object.values(this.palms)) {
      const age = now - p.seen
      const target = age <= C.TRACKING_HOLD_TIME ? 1 : 0
      p.alpha += (target - p.alpha) * (1 - Math.exp(-dt / (target ? C.TRACKING_REAPPEAR_TIME : C.TRACKING_FADE_TIME)))
      p.speed *= Math.exp(-dt / 0.12)
      if (age > C.TRACKING_HOLD_TIME + C.TRACKING_FADE_TIME * 4) { p.point = null; p.alpha = 0 }
    }
    const map = (p: Palm) => p.point ? coverPoint(p.point, this.source.width, this.source.height, width, height) : null
    return { left: map(this.palms.Left), right: map(this.palms.Right),
      alpha: Math.min(this.palms.Left.alpha, this.palms.Right.alpha),
      speed: Math.max(this.palms.Left.speed, this.palms.Right.speed) }
  }
}
