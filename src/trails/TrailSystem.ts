export interface Point { x: number; y: number }
interface Segment {
  a: Point; b: Point; control: Point; path: number; arc: number; length: number
  born: number; activation: number; retiring: number | null; kind: 'core' | 'tendril'
}
export interface TrailSources { core: Point; tendrils: { id: number; points: Point[] }[] }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const MAX_SEGMENTS = 6000

/** Sparse connected threads, with a bounded archive and local arc-length revival. */
export class TrailSystem {
  private segments: Segment[] = []
  private time = 0
  private sampleClock = 0
  private previous: Point | null = null
  private corePath = 0
  private coreArc = 0
  private nextPath = 1
  private lastTendrils = new Map<number, { tip: Point; middle: Point; time: number }>()
  private viewport = { width: 0, height: 0 }

  getDiagnostics() {
    return { segmentCount: this.segments.length,
      reactivatedCount: this.segments.filter(s => s.activation > 0.08).length }
  }

  resize(width: number, height: number): void {
    if (width === this.viewport.width && height === this.viewport.height) return
    if (this.viewport.width > 0 && width > 0 && height > 0) {
      const sx = width / this.viewport.width, sy = height / this.viewport.height
      for (const s of this.segments) for (const p of [s.a, s.b, s.control]) { p.x *= sx; p.y *= sy }
      // Recompute connected arc coordinates after an aspect-ratio change.
      const arcs = new Map<number, number>()
      for (const s of this.segments) {
        s.length = distance(s.a, s.b); s.arc = (arcs.get(s.path) ?? 0) + s.length / 2
        arcs.set(s.path, s.arc + s.length / 2)
      }
    }
    this.viewport = { width, height }
    this.previous = null; this.corePath = this.nextPath++; this.coreArc = 0
    this.lastTendrils.clear()
  }

  update(seconds: number, core: Point): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return
    this.time += Math.min(seconds, 0.05)
    this.sampleClock += Math.min(seconds, 0.05)
    if (this.sampleClock < 0.05) return
    const dt = this.sampleClock; this.sampleClock = 0
    const nearby = new Map<number, { arc: number; strength: number }[]>()
    for (const s of this.segments) {
      if (s.kind !== 'core' || this.time - s.born < 12 || s.retiring !== null) continue
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y
      const t = Math.max(0, Math.min(1, ((core.x - s.a.x) * dx + (core.y - s.a.y) * dy) / Math.max(1, s.length ** 2)))
      const d = Math.hypot(core.x - s.a.x - dx * t, core.y - s.a.y - dy * t)
      if (d >= 42) continue
      const list = nearby.get(s.path) ?? []
      list.push({ arc: s.arc + (t - 0.5) * s.length, strength: (1 - d / 42) ** 2 })
      nearby.set(s.path, list)
    }
    for (const s of this.segments) {
      let target = 0
      if (s.kind === 'core' && this.time - s.born >= 12 && s.retiring === null) {
        const hits = nearby.get(s.path) ?? []
        // Hits preserve path order. Search only the local arc interval even when
        // a long thread revisits the same small screen area hundreds of times.
        let lo = 0, hi = hits.length
        while (lo < hi) {
          const mid = (lo + hi) >>> 1
          if (hits[mid]!.arc < s.arc - 85) lo = mid + 1
          else hi = mid
        }
        for (let i = lo; i < hits.length && hits[i]!.arc <= s.arc + 85; i++) {
          const hit = hits[i]!
          target = Math.max(target, hit.strength * Math.max(0, 1 - Math.abs(hit.arc - s.arc) / 85) ** 2)
        }
      }
      s.activation += (target - s.activation) * (1 - Math.exp(-dt / (target > s.activation ? 0.65 : 3.5)))
    }
    this.segments = this.segments.filter(s => s.retiring === null || this.time - s.retiring < 8)
    // Retire faint history over eight seconds, never erase a visible batch abruptly.
    const live = this.segments.filter(s => s.retiring === null)
    if (live.length > 4800) {
      for (const s of live.slice(0, live.length - 4400)) s.retiring = this.time
    }
  }

  private add(a: Point, b: Point, path: number, arc: number, kind: Segment['kind']): number {
    const length = distance(a, b)
    if (length < 0.1 || this.segments.length >= MAX_SEGMENTS) return length
    const wiggle = Math.sin(path * 2.71 + arc * 0.13) * Math.min(0.85, length * 0.07)
    this.segments.push({ a: { ...a }, b: { ...b },
      control: { x: (a.x + b.x) / 2 - (b.y - a.y) / length * wiggle,
        y: (a.y + b.y) / 2 + (b.x - a.x) / length * wiggle },
      path, arc: arc + length / 2, length, born: this.time, activation: 0, retiring: null, kind })
    return length
  }

  capture(sources: TrailSources): void {
    if (!this.previous) this.previous = { ...sources.core }
    if (distance(this.previous, sources.core) >= 5) {
      this.coreArc += this.add(this.previous, sources.core, this.corePath, this.coreArc, 'core')
      this.previous = { ...sources.core }
    }
    const active = new Set<number>()
    for (const tendril of sources.tendrils) {
      active.add(tendril.id)
      const tip = tendril.points.at(-1), middle = tendril.points[Math.floor(tendril.points.length / 2)]
      if (!tip || !middle) continue
      const last = this.lastTendrils.get(tendril.id)
      if (last && (this.time - last.time < 0.8 || Math.max(distance(tip, last.tip), distance(middle, last.middle)) < 22)) continue
      const path = this.nextPath++
      let arc = 0
      for (let i = 1; i < tendril.points.length; i++) {
        arc += this.add(tendril.points[i - 1]!, tendril.points[i]!, path, arc, 'tendril')
      }
      this.lastTendrils.set(tendril.id, { tip: { ...tip }, middle: { ...middle }, time: this.time })
    }
    for (const id of this.lastTendrils.keys()) if (!active.has(id)) this.lastTendrils.delete(id)
  }

  draw(context: CanvasRenderingContext2D): void {
    // Bucket opacity to batch paths. No per-segment blur, particles, or full-resolution history buffers.
    const buckets: Segment[][] = Array.from({ length: 32 }, () => [])
    for (const s of this.segments) {
      const fresh = s.kind === 'core' ? 0.15 : 0.075
      const age = this.time - s.born
      const retirement = s.retiring === null ? 1 : Math.max(0, 1 - (this.time - s.retiring) / 8) ** 2
      const alpha = (0.002 + fresh * Math.exp(-age / 28) + s.activation * 0.13) * retirement
      const bucket = Math.min(31, Math.floor(alpha / 0.006))
      buckets[bucket]!.push(s)
    }
    context.save()
    context.lineWidth = 0.55
    context.lineCap = 'round'
    for (let i = 0; i < buckets.length; i++) {
      if (!buckets[i]!.length) continue
      context.strokeStyle = `rgba(239,232,220,${i * 0.006 + 0.002})`
      context.beginPath()
      for (const s of buckets[i]!) {
        context.moveTo(s.a.x, s.a.y)
        context.quadraticCurveTo(s.control.x, s.control.y, s.b.x, s.b.y)
      }
      context.stroke()
    }
    context.restore()
  }
}
