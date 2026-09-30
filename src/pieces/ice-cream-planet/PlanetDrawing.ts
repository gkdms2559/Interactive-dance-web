import { ICE_CONFIG as C, clamp, distance } from './config.ts'
import type { Point } from './config.ts'
import type { TrackedPose } from '../../modules/pose/types.ts'
import { randomSparkle } from './pencil.ts'

export interface PencilSegment { a: Point; b: Point; color: string; width: number; seed: number }
export interface Sparkle { position: Point; size: number; color: string; kind: number }
interface HandState {
  previous: Point | null; anchor: Point | null; selected: number; switched: number; grown: number; seen: number
}
interface Vine {
  planet: number
  point: Point; heading: number; length: number; travelled: number; color: string
  phase: number; curl: number; curlStart: number; branch: boolean; branches: number; nextBranch: number; width: number
  steerAt: number; steering: number
}

/** Input and growth simulation only: completed marks are emitted, never kept as historical paths. */
export class PlanetDrawing {
  private width = 1200
  private height = 900
  private time = 0
  private timestamp = -Infinity
  private chainAt = -Infinity
  private starAt = -Infinity
  private vines: Vine[] = []
  private segments: PencilSegment[] = []
  private stars: Sparkle[] = []
  private density = new Float32Array(C.densityColumns * C.densityRows)
  private pulses = [0, 0, 0, 0, 0]
  private tips: Point[][] = Array.from({ length: C.planets.length }, () => [])
  private hands: HandState[] = Array.from({ length: 2 }, () => ({
    previous: null, anchor: null, selected: -1, switched: -Infinity, grown: -Infinity, seen: -Infinity,
  }))
  private random: () => number
  constructor(random: () => number = Math.random) { this.random = random }

  resize(width: number, height: number): void {
    const sx = width / this.width, sy = height / this.height
    for (const v of this.vines) {
      v.point.x *= sx; v.point.y *= sy
      v.heading = Math.atan2(Math.sin(v.heading) * sy, Math.cos(v.heading) * sx)
      v.length *= Math.sqrt(sx * sy); v.travelled *= Math.sqrt(sx * sy)
    }
    for (const tips of this.tips) for (const tip of tips) { tip.x *= sx; tip.y *= sy }
    // New inference establishes a new anchor; resizing alone must never draw.
    for (const h of this.hands) { h.previous = null; h.anchor = null }
    this.width = width; this.height = height
  }
  planet(index: number) {
    const p = C.planets[index]!
    return { x: p.x * this.width + Math.sin(this.time * C.planetFloatSpeed + index * 2.3) * C.planetFloatAmount,
      y: p.y * this.height + Math.sin(this.time * C.planetFloatSpeed * 0.73 + index) * C.planetFloatAmount,
      radius: p.radius * Math.min(this.width, this.height), pulse: this.pulses[index]! }
  }
  getDiagnostics() {
    return { activePlanets: this.hands.map(h => h.selected), growingVines: this.vines.length,
      densityCells: this.density.length, planetPulses: [...this.pulses],
      rememberedTips: this.tips.reduce((sum, tips) => sum + tips.length, 0) }
  }
  private color(): string { return C.palette[Math.floor(this.random() * C.palette.length)]! }
  private cell(p: Point): number {
    const x = clamp(Math.floor(p.x / this.width * C.densityColumns), 0, C.densityColumns - 1)
    const y = clamp(Math.floor(p.y / this.height * C.densityRows), 0, C.densityRows - 1)
    return y * C.densityColumns + x
  }
  private openDirection(origin: Point, heading: number): number {
    let best = heading, score = Infinity
    for (const turn of [-0.65, -0.3, 0, 0.3, 0.65]) {
      const angle = heading + turn
      const probe = { x: origin.x + Math.cos(angle) * C.densityLookAhead, y: origin.y + Math.sin(angle) * C.densityLookAhead }
      const halfway = { x: (origin.x + probe.x) / 2, y: (origin.y + probe.y) / 2 }
      const edge = probe.x < 15 || probe.x > this.width - 15 || probe.y < 15 || probe.y > this.height - 15 ? 3 : 0
      const crowding = (Math.log1p(this.density[this.cell(probe)]!) + Math.log1p(this.density[this.cell(halfway)]!)) / 2
      const planetSpace = C.planets.reduce((cost, _, i) => {
        const planet = this.planet(i)
        return cost + (distance(probe, planet) < planet.radius + 12 ? 0.7 : 0)
      }, 0)
      const cost = crowding * C.densityBias + Math.abs(turn) * 0.5 + edge + planetSpace
      if (cost < score) { score = cost; best = angle }
    }
    return best + (this.random() - 0.5) * 0.18
  }
  private grow(origin: Point, heading: number, length: number, branch = true, planet = 0): void {
    if (this.vines.length >= C.maxGrowingVines) return
    this.vines.push({ planet, point: { ...origin }, heading: this.openDirection(origin, heading), length,
      travelled: 0, color: this.color(), phase: this.random() * Math.PI * 2,
      curl: (this.random() < 0.5 ? -1 : 1) * C.vineCurlAmount * (0.55 + this.random() * 0.9),
      curlStart: C.curlStartMin + this.random() * (C.curlStartMax - C.curlStartMin),
      branch, branches: 0, nextBranch: 0.17 + this.random() * 0.09,
      steerAt: C.densitySteeringInterval, steering: 0,
      width: C.vineStrokeWidth * (branch ? 1 : C.branchStrokeRatio) * (0.8 + this.random() * 0.4) })
  }
  private decorate(position: Point): void {
    if (this.time - this.starAt < C.starCooldown || this.random() > C.starSpawnProbability) return
    this.starAt = this.time
    const x = clamp(position.x + (this.random() - 0.5) * 22, 30, this.width - 30)
    const y = clamp(position.y + (this.random() - 0.5) * 22, 30, this.height - 30)
    this.stars.push(randomSparkle({ x, y }, this.random))
    if (this.random() < C.starClusterProbability) {
      for (let i = 0; i < 2; i++) this.stars.push({ position: {
        x: clamp(x + (this.random() - 0.5) * 44, 8, this.width - 8),
        y: clamp(y + (this.random() - 0.5) * 44, 8, this.height - 8) },
        color: this.color(), size: 2 + this.random() * 3, kind: i === 0 ? 2 : 1 })
    }
  }

  receive(pose: TrackedPose, timestamp: number): void {
    if (!Number.isFinite(timestamp) || timestamp <= this.timestamp) return
    const gap = (timestamp - this.timestamp) / 1000
    this.timestamp = timestamp
    const diagonal = Math.hypot(this.width, this.height)
    ;[pose.leftWrist, pose.rightWrist].forEach((point, side) => {
      const hand = this.hands[side]!
      if (!point) { hand.previous = null; hand.anchor = null; hand.selected = -1; return }
      const p = { x: point.x * this.width, y: point.y * this.height }
      if (gap > 0.5) { hand.previous = null; hand.anchor = null }
      const dx = p.x - (hand.previous?.x ?? p.x), dy = p.y - (hand.previous?.y ?? p.y)
      const step = Math.hypot(dx, dy)
      const scores = C.planets.map((_, i) => {
        const planet = this.planet(i), d = distance(p, planet)
        const approach = step > 0 ? (dx * (planet.x - p.x) + dy * (planet.y - p.y)) / step / Math.max(1, d) : 0
        return (d - planet.radius) / diagonal - Math.max(0, approach) * Math.min(0.04, step / diagonal)
      })
      const nearest = scores.indexOf(Math.min(...scores))
      if (hand.selected < 0 || (this.time - hand.switched > C.selectionCooldown
        && scores[hand.selected]! - scores[nearest]! > C.selectionMargin)) {
        hand.selected = nearest; hand.switched = this.time
      }
      hand.seen = this.time
      const moved = hand.anchor ? distance(p, hand.anchor) / diagonal : 0
      if (hand.previous && hand.anchor && moved >= C.movementThreshold
        && step / diagonal >= C.jitterStepThreshold && this.time - hand.grown >= C.handGrowthCooldown) {
        hand.grown = this.time
        const planet = this.planet(hand.selected)
        const toward = Math.atan2(p.y - planet.y, p.x - planet.x)
        const motion = Math.atan2(dy, dx)
        const heading = Math.atan2(Math.sin(motion) * 0.65 + Math.sin(toward) * 0.35,
          Math.cos(motion) * 0.65 + Math.cos(toward) * 0.35)
        let origin = { x: planet.x + Math.cos(heading) * planet.radius * 0.88,
          y: planet.y + Math.sin(heading) * planet.radius * 0.88 }
        // Occasionally continue an existing curl to grow a network beyond the initial planet halo.
        const tips = this.tips[hand.selected]!
        if (tips.length && this.random() < C.continuationProbability) {
          origin = [...tips].sort((a, b) => {
            const cost = (tip: Point) => Math.log1p(this.density[this.cell(tip)]!) * C.densityBias
              + distance(tip, p) / diagonal
            return cost(a) - cost(b)
          })[0]!
        }
        const strength = clamp(moved / C.strongMovement, 0, 1)
        this.grow(origin, heading, C.vineMinLength + strength * (C.vineMaxLength - C.vineMinLength), true, hand.selected)
        this.pulses[hand.selected] = 1
        this.decorate(origin)
        if (strength > 0.65 && this.time - this.chainAt > C.secondaryCooldown
          && this.random() < C.secondaryReactionProbability) {
          this.chainAt = this.time
          const neighbors = C.planets.map((_, i) => i).filter(i => i !== hand.selected)
            .sort((a, b) => distance(this.planet(a), planet) - distance(this.planet(b), planet))
          for (const index of neighbors.slice(0, strength > 0.95 && this.random() < 0.35 ? 2 : 1)) {
            const other = this.planet(index), angle = Math.atan2(planet.y - other.y, planet.x - other.x)
            this.grow({ x: other.x + Math.cos(angle) * other.radius * 0.9,
              y: other.y + Math.sin(angle) * other.radius * 0.9 }, angle, C.vineMaxLength * 0.6, false, index)
            this.pulses[index] = 0.65
          }
        }
        hand.anchor = { ...p }
      }
      hand.anchor ??= { ...p }
      hand.previous = p
    })
  }

  update(seconds: number): void {
    const dt = clamp(Number.isFinite(seconds) ? seconds : 0, 0, C.maxDelta)
    this.time += dt
    this.pulses = this.pulses.map(p => p * Math.exp(-dt / 0.7))
    for (const hand of this.hands) {
      if (this.time - hand.seen > 0.6) { hand.selected = -1; hand.previous = null; hand.anchor = null }
      else if (hand.selected >= 0) this.pulses[hand.selected] = Math.max(this.pulses[hand.selected]!, 0.2)
    }
    // Snapshot: child branches start on the next frame, bounding work per update.
    for (const vine of [...this.vines]) {
      let budget = Math.min(C.vineGrowthSpeed * dt, vine.length - vine.travelled)
      while (budget > 0.001) {
        const step = Math.min(2.5, budget), progress = vine.travelled / vine.length
        const curling = progress > vine.curlStart
        const curlTightness = 0.025 + Math.max(0, progress - vine.curlStart) / (1 - vine.curlStart) * 0.075
        vine.heading += (curling ? vine.curl * curlTightness : Math.sin(vine.travelled * 0.035 + vine.phase) * 0.016) * step
        if (!curling) {
          if (vine.travelled >= vine.steerAt) {
            vine.steerAt += C.densitySteeringInterval
            const desired = this.openDirection(vine.point, vine.heading) - vine.heading
            vine.steering = Math.atan2(Math.sin(desired), Math.cos(desired))
          }
          vine.heading += vine.steering * step * 0.012
          const x = vine.point.x, y = vine.point.y
          const inwardX = Math.max(0, 35 - x) - Math.max(0, x - this.width + 35)
          const inwardY = Math.max(0, 35 - y) - Math.max(0, y - this.height + 35)
          if (Math.hypot(inwardX, inwardY) > 0) {
            const turn = Math.atan2(inwardY, inwardX) - vine.heading
            vine.heading += Math.atan2(Math.sin(turn), Math.cos(turn)) * step * 0.025
          }
        }
        const next = { x: vine.point.x + Math.cos(vine.heading) * step, y: vine.point.y + Math.sin(vine.heading) * step }
        this.segments.push({ a: vine.point, b: next, color: vine.color,
          width: vine.width * (0.82 + Math.sin(progress * Math.PI) * 0.3) * (1 - progress * 0.3),
          seed: vine.phase + vine.travelled * 0.05 })
        this.density[this.cell(next)]! = Math.min(10000, this.density[this.cell(next)]! + step / 20)
        vine.point = next; vine.travelled += step; budget -= step
        if (vine.branch && vine.branches < C.branchesPerStem && progress > vine.nextBranch && !curling) {
          vine.branches++
          vine.nextBranch += 0.16 + this.random() * 0.09
          if (this.random() < C.branchProbability) {
            const side = (vine.branches % 2 ? -1 : 1) * (Math.sin(vine.phase) < 0 ? -1 : 1)
            this.grow(next, vine.heading + side * (0.65 + this.random() * 0.5),
              vine.length * C.branchLength * (0.55 + this.random() * 0.65), false, vine.planet)
            this.decorate(next)
          }
        }
      }
      if (vine.travelled >= vine.length - 0.01) {
        this.decorate(vine.point)
        if (vine.point.x > 20 && vine.point.y > 20 && vine.point.x < this.width - 20 && vine.point.y < this.height - 20) {
          const tips = this.tips[vine.planet]!
          tips.push({ ...vine.point })
          if (tips.length > C.rememberedTipsPerPlanet) tips.shift()
        }
      }
    }
    this.vines = this.vines.filter(v => v.travelled < v.length - 0.01)
  }
  drain(): { segments: PencilSegment[]; stars: Sparkle[] } {
    const batch = { segments: this.segments, stars: this.stars }
    this.segments = []; this.stars = []
    return batch
  }
}
