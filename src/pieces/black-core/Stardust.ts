import { BLACK_CONFIG as C, clamp } from './config.ts'
import type { Point } from './config.ts'
import type { PoseInfluence } from '../../entities/PoseInfluence.ts'
interface Particle extends Point { vx: number; vy: number; age: number; life: number; size: number; star: boolean }
export class Stardust {
  private particles: Particle[] = []
  private previous: Point | null = null
  private credit = 0
  private cooldown = { left: 0, right: 0 }
  private reach = { left: 0, right: 0 }
  get count() { return this.particles.length }
  clear(): void { this.particles = []; this.previous = null; this.credit = 0 }
  private emit(point: Point): void {
    if (this.particles.length >= C.PARTICLE_MAX_COUNT) return
    this.particles.push({ x: point.x + (Math.random() - .5) * 7, y: point.y + (Math.random() - .5) * 7,
      vx: (Math.random() - .5) * 12, vy: (Math.random() - .5) * 12, age: 0,
      life: C.PARTICLE_LIFETIME[0] + Math.random() * (C.PARTICLE_LIFETIME[1] - C.PARTICLE_LIFETIME[0]),
      size: C.PARTICLE_SIZE[0] + Math.random() * (C.PARTICLE_SIZE[1] - C.PARTICLE_SIZE[0]), star: Math.random() < .13 })
  }
  update(seconds: number, core: Point, influence?: PoseInfluence, attraction?: Point): void {
    const dt = clamp(seconds, 0, .05)
    const old = this.previous ?? core
    const distance = Math.hypot(core.x - old.x, core.y - old.y)
    this.credit += Math.min(distance * C.PARTICLE_PER_PIXEL, dt * C.PARTICLE_SPAWN_RATE)
    const count = Math.floor(this.credit); this.credit -= count
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count
      this.emit({ x: old.x + (core.x - old.x) * t, y: old.y + (core.y - old.y) * t })
    }
    this.previous = { ...core }
    for (const side of ['left', 'right'] as const) {
      this.cooldown[side] -= dt
      const hand = influence?.[side]
      if (hand && hand.activity > .2 && this.cooldown[side] <= 0
        && (hand.speed > C.TENTACLE_SPARKLE_SPEED || hand.reachAmount - this.reach[side] > .06)) {
        for (let i = 0; i < 3; i++) {
          const t = (.3 + Math.random() * .6) * hand.reachAmount
          this.emit({ x: core.x + (hand.target.x - core.x) * t, y: core.y + (hand.target.y - core.y) * t })
        }
        this.cooldown[side] = C.TENTACLE_SPARKLE_COOLDOWN
      }
      this.reach[side] = hand?.reachAmount ?? 0
    }
    for (const p of this.particles) {
      p.age += dt
      if (attraction && p.star) { p.vx += (attraction.x - p.x) * dt * .8; p.vy += (attraction.y - p.y) * dt * .8 }
      p.x += p.vx * dt; p.y += p.vy * dt
    }
    this.particles = this.particles.filter(p => p.age < p.life)
  }
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save(); ctx.fillStyle = '#f9e8cc'; ctx.strokeStyle = '#f9e8cc'; ctx.lineWidth = .65
    ctx.shadowColor = '#eed6b0'; ctx.shadowBlur = C.PARTICLE_GLOW
    for (const p of this.particles) {
      ctx.globalAlpha = C.PARTICLE_ALPHA * Math.min(1, p.age / .12) * (1 - p.age / p.life) ** 1.5
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * .5, 0, Math.PI * 2); ctx.fill()
      if (p.star) {
        ctx.beginPath(); ctx.moveTo(p.x - p.size, p.y); ctx.lineTo(p.x + p.size, p.y)
        ctx.moveTo(p.x, p.y - p.size); ctx.lineTo(p.x, p.y + p.size); ctx.stroke()
      }
    }
    ctx.restore()
  }
}
