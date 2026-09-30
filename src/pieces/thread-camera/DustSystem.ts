import { THREAD_CONFIG as C } from './config.ts'
import type { ThreadState } from './PalmTracker.ts'

export class DustSystem {
  private particles = Array.from({ length: C.PARTICLE_MAX_COUNT }, () => ({
    alive: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1, phase: 0, color: '#ffffff', alpha: 0,
  }))
  private budget = 0
  private previous: { x: number; y: number } | null = null
  private random: () => number
  constructor(random = Math.random) { this.random = random }
  reset(): void { for (const p of this.particles) p.alive = false; this.previous = null; this.budget = 0 }
  get count() { return this.particles.filter(p => p.alive).length }
  update(seconds: number, thread: ThreadState): void {
    const dt = Math.min(0.05, Math.max(0, seconds))
    const { left: a, right: b } = thread
    const length = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
    const center = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null
    const pullX = center && this.previous ? Math.max(-3, Math.min(3, (center.x - this.previous.x) * C.PARTICLE_REACTION_TO_HAND_SPEED)) : 0
    const pullY = center && this.previous ? Math.max(-3, Math.min(3, (center.y - this.previous.y) * C.PARTICLE_REACTION_TO_HAND_SPEED)) : 0
    this.previous = center
    for (const p of this.particles) {
      if (!p.alive) continue
      p.age += dt
      if (p.age >= p.life) { p.alive = false; continue }
      p.vx = p.vx * Math.exp(-dt * 0.8) + pullX
      p.vy = p.vy * Math.exp(-dt * 0.8) + pullY
      p.x += (p.vx + Math.sin(p.age * 1.4 + p.phase) * C.PARTICLE_DRIFT) * dt
      p.y += (p.vy - C.PARTICLE_DRIFT * 0.35 + Math.cos(p.age + p.phase) * C.PARTICLE_DRIFT * 0.5) * dt
      let proximity = 0
      if (a && b) {
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / Math.max(1, length ** 2)))
        const d = Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y))
        proximity = Math.exp(-d * d / (C.PARTICLE_BAND * 2) ** 2) * thread.alpha
      }
      const envelope = Math.min(1, p.age / 0.35) * Math.min(1, (p.life - p.age) / 0.8)
      p.alpha += (envelope * proximity * C.PARTICLE_ALPHA * (0.75 + Math.sin(p.age * 2 + p.phase) * 0.15) - p.alpha)
        * (1 - Math.exp(-dt / 0.15))
    }
    if (!a || !b || thread.alpha < 0.1 || length < 1) { this.budget = 0; return }
    this.budget = Math.min(4, this.budget + C.PARTICLE_SPAWN_RATE * dt * Math.min(1.5, 0.35 + length / 650) * thread.alpha)
    while (this.budget >= 1) {
      this.budget--
      const p = this.particles.find(p => !p.alive)
      if (!p) break
      const t = this.random(), offset = (this.random() + this.random() - 1) * C.PARTICLE_BAND
      p.alive = true; p.age = 0; p.alpha = 0
      p.x = a.x + (b.x - a.x) * t - (b.y - a.y) / length * offset
      p.y = a.y + (b.y - a.y) * t + (b.x - a.x) / length * offset
      p.phase = this.random() * Math.PI * 2
      p.life = C.PARTICLE_LIFETIME_MIN + this.random() * (C.PARTICLE_LIFETIME_MAX - C.PARTICLE_LIFETIME_MIN)
      p.size = C.PARTICLE_SIZE_MIN + this.random() ** 3 * (C.PARTICLE_SIZE_MAX - C.PARTICLE_SIZE_MIN)
      const kick = Math.min(9, thread.speed * C.PARTICLE_REACTION_TO_HAND_SPEED)
      p.vx = (this.random() - 0.5) * (C.PARTICLE_DRIFT + kick)
      p.vy = (this.random() - 0.5) * (C.PARTICLE_DRIFT + kick)
      p.color = C.PARTICLE_COLORS[this.random() < 0.9 ? Math.floor(this.random() * 3) : 3 + Math.floor(this.random() * 2)]!
    }
  }
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    for (const p of this.particles) {
      if (!p.alive || p.alpha < 0.003) continue
      ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
}
