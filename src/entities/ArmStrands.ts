import type { HandInfluence } from './PoseInfluence.ts'
import type { Point } from '../trails/TrailSystem.ts'

/** Smooth interpolating cubic through root, shoulder, elbow and wrist. */
export function armPoint(nodes: Point[], progress: number): Point {
  const t = Math.max(0, Math.min(1, progress)) * (nodes.length - 1)
  const i = Math.min(nodes.length - 2, Math.floor(t)), u = t - i
  const a = nodes[Math.max(0, i - 1)]!, b = nodes[i]!, c = nodes[i + 1]!, d = nodes[Math.min(nodes.length - 1, i + 2)]!
  const axis = (key: 'x' | 'y') => {
    const m1 = (c[key] - a[key]) * 0.35, m2 = (d[key] - b[key]) * 0.35
    return (2 * u ** 3 - 3 * u ** 2 + 1) * b[key] + (u ** 3 - 2 * u ** 2 + u) * m1
      + (-2 * u ** 3 + 3 * u ** 2) * c[key] + (u ** 3 - u ** 2) * m2
  }
  return { x: axis('x'), y: axis('y') }
}

/** One arm curve drives one primary and eleven varied fine secondary strands. */
export class ArmStrands {
  private time = 0
  private residual = [0, 0]
  private trails: { id: number; points: Point[] }[] = []
  update(dt: number, left: HandInfluence | null, right: HandInfluence | null): void {
    this.time += dt
    ;[left, right].forEach((hand, i) => {
      this.residual[i] = Math.max((hand?.speed ?? 0), this.residual[i]! * Math.exp(-dt / 0.18))
    })
  }
  getTrails() { return this.trails }
  draw(ctx: CanvasRenderingContext2D, core: Point, left: HandInfluence | null, right: HandInfluence | null): void {
    this.trails = []
    ctx.save()
    ctx.lineCap = 'round'
    ;[left, right].forEach((hand, side) => {
      if (!hand?.arm || hand.activity < 0.01) return
      const { shoulder, elbow } = hand.arm
      const nodes = [core, shoulder, elbow ?? { x: (shoulder.x + hand.target.x) / 2, y: (shoulder.y + hand.target.y) / 2 }, hand.target]
      const primary = Array.from({ length: 49 }, (_, i) => armPoint(nodes, i / 48))
      if (hand.reachAmount > 0.65 || hand.speed > 0.12) this.trails.push({ id: 100 + side, points: primary.filter((_, i) => i % 3 === 0) })
      for (let strand = 0; strand < 12; strand++) {
        const isPrimary = strand === 0
        const phase = strand * 2.399 + side * 1.7
        const fraction = isPrimary ? 1 : 0.7 + (Math.sin(phase) + 1) * 0.135
        let previous: Point | null = null
        for (let i = 0; i <= 48; i++) {
          const u = i / 48, t = u * fraction
          // Interpolate the shared sampled curve; no landmark work per strand.
          const at = Math.min(47, Math.floor(t * 48)), blend = t * 48 - at
          const a = primary[at]!, b = primary[at + 1]!
          const length = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
          const tipResidue = !isPrimary && strand % 4 === 0
            ? this.residual[side]! * Math.sin(this.time * 14 + phase) * 3 * u ** 5 : 0
          const offset = isPrimary ? 0 : Math.sin(phase) * 13 * Math.sin(Math.PI * u)
            + Math.sin(u * 5 + phase + this.time * 1.3) * 2 * u
            + Math.cos(phase) * 3 * (1 - u) + tipResidue
          const point = { x: a.x + (b.x - a.x) * blend - (b.y - a.y) / length * offset,
            y: a.y + (b.y - a.y) * blend + (b.x - a.x) / length * offset }
          if (previous) {
            ctx.strokeStyle = `rgba(239,224,201,${(isPrimary ? 0.48 : 0.12 + (Math.sin(phase) + 1) * 0.055) * (1 - u * 0.85) ** 0.55 * hand.activity})`
            ctx.lineWidth = (isPrimary ? 0.8 : 0.42 + (Math.cos(phase) + 1) * 0.1) * (1 - u * 0.3)
            ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(point.x, point.y); ctx.stroke()
          }
          previous = point
        }
      }
    })
    ctx.restore()
  }
}
