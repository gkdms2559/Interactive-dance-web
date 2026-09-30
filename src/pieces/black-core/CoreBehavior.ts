import { BLACK_CONFIG as C, clamp } from './config.ts'
import type { Behavior } from './config.ts'

export class CoreBehavior {
  private position = { x: 0.5, y: 0.5 }
  private viewport = { width: 1, height: 1 }
  private velocity = { x: 0, y: 0 }
  private state: Behavior = 'REST'
  private age = 0
  private duration = C.BEHAVIORS.REST.min as number
  private heading = -0.6
  private hops = 0
  private hopCount = 2
  private random: () => number
  constructor(random = Math.random) { this.random = random }
  resize(width: number, height: number): void {
    this.position.x *= width / this.viewport.width; this.position.y *= height / this.viewport.height
    this.viewport = { width, height }; this.contain()
  }
  private contain(): void {
    const mx = Math.min(C.CORE_SAFE_MARGIN, this.viewport.width / 3)
    const my = Math.min(C.CORE_SAFE_MARGIN, this.viewport.height / 3)
    const x = clamp(this.position.x, mx, this.viewport.width - mx), y = clamp(this.position.y, my, this.viewport.height - my)
    if (x !== this.position.x) this.velocity.x = 0
    if (y !== this.position.y) this.velocity.y = 0
    this.position = { x, y }
  }
  private next(): void {
    const choices = (Object.keys(C.BEHAVIORS) as Behavior[]).filter(s => this.state === 'DASH' ? s === 'REST' || s === 'DRIFT' : s !== this.state)
    let choice = this.random() * choices.reduce((sum, s) => sum + C.BEHAVIORS[s].weight, 0)
    this.state = choices.find(s => { choice -= C.BEHAVIORS[s].weight; return choice <= 0 }) ?? 'REST'
    const recipe = C.BEHAVIORS[this.state]
    this.duration = recipe.min + this.random() * (recipe.max - recipe.min)
    this.age = 0; this.hops = 0; this.hopCount = this.random() < 0.5 ? 2 : 3
    this.heading += (this.random() - 0.5) * 2.5
  }
  update(seconds: number): void {
    const dt = clamp(seconds, 0, 0.05)
    this.age += dt
    if (this.age >= this.duration) this.next()
    let speed = 0
    if (this.state === 'DRIFT') {
      this.heading += Math.sin(this.age * 0.7) * dt * 0.22
      speed = C.DRIFT_SPEED * (0.75 + Math.sin(this.age * 0.9) * 0.25)
    }
    if (this.state === 'DASH') speed = C.DASH_SPEED * Math.sin(Math.PI * this.age / this.duration)
    if (this.state === 'HOP' && this.hops < this.hopCount && this.age >= this.hops * 0.43) {
      this.velocity.x += Math.cos(this.heading) * C.HOP_POWER
      this.velocity.y += Math.sin(this.heading) * C.HOP_POWER - 22
      this.hops++
    }
    let vx = Math.cos(this.heading) * speed, vy = Math.sin(this.heading) * speed
    const margin = C.CORE_SAFE_MARGIN + 40
    const futureX = this.position.x + this.velocity.x * 0.65, futureY = this.position.y + this.velocity.y * 0.65
    vx += (Math.max(0, margin - futureX) - Math.max(0, futureX - this.viewport.width + margin)) * 1.2
    vy += (Math.max(0, margin - futureY) - Math.max(0, futureY - this.viewport.height + margin)) * 1.2
    const follow = 1 - Math.exp(-dt / (this.state === 'HOP' ? 0.19 : this.state === 'DASH' ? 0.12 : 0.55))
    this.velocity.x += (vx - this.velocity.x) * follow
    this.velocity.y += (vy - this.velocity.y) * follow
    this.position.x += this.velocity.x * dt; this.position.y += this.velocity.y * dt
    this.contain()
  }
  snapshot() {
    const t = this.age / this.duration
    const shiver = this.state === 'SHIVER' ? Math.sin(t * Math.PI) : 0
    const sparkle = this.state === 'SPARKLE'
      ? Math.exp(-(((t - 0.23) / 0.12) ** 2)) + 0.55 * Math.exp(-(((t - 0.65) / 0.09) ** 2)) : 0
    return { position: {
      x: clamp(this.position.x + Math.sin(this.age * 83) * shiver * C.SHIVER_STRENGTH, Math.min(C.CORE_SAFE_MARGIN, this.viewport.width / 3), this.viewport.width - Math.min(C.CORE_SAFE_MARGIN, this.viewport.width / 3)),
      y: clamp(this.position.y + Math.sin(this.age * 67) * shiver * C.SHIVER_STRENGTH * .65, Math.min(C.CORE_SAFE_MARGIN, this.viewport.height / 3), this.viewport.height - Math.min(C.CORE_SAFE_MARGIN, this.viewport.height / 3)),
    }, velocity: { ...this.velocity }, state: this.state,
      shiver, glow: sparkle * C.SPARKLE_STRENGTH, scale: 1 + shiver * 0.025 }
  }
}
