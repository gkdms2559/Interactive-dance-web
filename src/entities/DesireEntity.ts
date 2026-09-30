import { emptyInfluence, handAffinity } from './PoseInfluence.ts'
import type { PoseInfluence } from './PoseInfluence.ts'
import { selectTendrilGroups } from './tendrilGroups.ts'
import type { HandSide, TendrilRole } from './tendrilGroups.ts'
import { BLACK_CONFIG as C } from '../pieces/black-core/config.ts'

export interface DesireState {
  /** Normalized 0..1. */
  energy: number
  /** Normalized 0..1; zero preserves the small resting size. */
  expansion: number
  /** Each component is -1..1, in screen coordinates. Zero means no bias. */
  motionDirection: { x: number; y: number }
  /** Normalized 0..1. */
  excitement: number
}

interface Fiber {
  angle: number
  baseLength: number
  currentLength: number
  baseCurvature: number
  curvature: number
  handActivity: number
  handSpeed: number
  owner: HandSide | null
  role: TendrilRole | null
  reachBlend: number
  endpoint: { x: number; y: number; vx: number; vy: number }
  curl: number
  phase: number
  delay: number
  opacity: number
  width: number
  restless: boolean
  points: Float32Array
}

const TAU = Math.PI * 2
const SEGMENTS = 32
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const ease = (value: number) => value * value * (3 - 2 * value)

// Smooth, seeded variation: no per-frame randomness or discontinuous jitter.
function noise(time: number, seed: number): number {
  const hash = (value: number) => {
    const n = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  const step = Math.floor(time)
  return hash(step) + (hash(step + 1) - hash(step)) * ease(time - step)
}

export class DesireEntity {
  private readonly target: DesireState = {
    energy: 0.18,
    expansion: 0,
    motionDirection: { x: 0, y: 0 },
    excitement: 0.04,
  }
  private readonly state: DesireState = {
    ...this.target,
    motionDirection: { ...this.target.motionDirection },
  }
  private readonly fibers: Fiber[]
  private time = 0
  private breathPhase = 0.6
  private swayPhase = 0
  private poseInfluence = emptyInfluence()
  private head = { x: 0, y: 0 }
  private drawScale = 1
  private presentation = { position: null as { x: number; y: number } | null,
    velocity: { x: 0, y: 0 }, state: 'REST', scale: 1, alpha: 1, glow: 0, shiver: 0 }

  setPresentation(next: Partial<typeof this.presentation>): void {
    this.presentation = { ...this.presentation, ...next }
  }

  constructor(initialState: Partial<DesireState> = {}) {
    let seed = 71423
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }

    this.fibers = Array.from({ length: C.TENTACLE_COUNT }, (_, index) => {
      const angle = random() * TAU
      const baseLength = (46 + random() ** 1.25 * 72) * C.TENTACLE_LENGTH * (index >= 40 ? 0.5 : 1)
      const baseCurvature = (random() - 0.5) * 70
      return {
        // Unequal angles and lengths keep the silhouette from becoming a starburst.
        angle, baseLength, currentLength: baseLength, baseCurvature, curvature: baseCurvature,
        handActivity: 0, handSpeed: 0,
        owner: null, role: null, reachBlend: 0,
        endpoint: { x: Math.cos(angle) * baseLength, y: Math.sin(angle) * baseLength, vx: 0, vy: 0 },
        curl: (random() - 0.5) * 44,
        phase: random() * TAU,
        delay: 0.12 + random() * 0.7,
        opacity: (0.16 + random() * 0.27) * (index >= 40 ? 0.65 : 1),
        width: (0.49 + random() * 0.49) * C.TENTACLE_WIDTH * (index >= 40 ? 0.6 : 1),
        restless: index === 4 || index === 19,
        points: new Float32Array((SEGMENTS + 1) * 2),
      }
    })
    this.setState(initialState)
  }

  /** Input adapters supply state without owning rendering or the clock. */
  setState(next: Partial<DesireState>): void {
    for (const key of ['energy', 'expansion', 'excitement'] as const) {
      const value = next[key]
      if (value !== undefined && Number.isFinite(value)) this.target[key] = clamp(value, 0, 1)
    }
    if (next.motionDirection) {
      const { x, y } = next.motionDirection
      if (Number.isFinite(x)) this.target.motionDirection.x = clamp(x, -1, 1)
      if (Number.isFinite(y)) this.target.motionDirection.y = clamp(y, -1, 1)
    }
  }

  /** A snapshot of the actual interpolated rendering state, not only input targets. */
  getState(): DesireState {
    return { ...this.state, motionDirection: { ...this.state.motionDirection } }
  }

  setPoseInfluence(influence: PoseInfluence): void {
    const viewport = influence.viewport
    if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)
      || viewport.width <= 0 || viewport.height <= 0) return
    const clean = (hand: PoseInfluence['left']) => {
      if (!hand?.target || ![hand.target.x, hand.target.y, hand.reachAmount, hand.activity, hand.speed].every(Number.isFinite)) return null
      const dx = hand.target.x - viewport.width / 2
      const dy = hand.target.y - viewport.height / 2
      const distance = Math.hypot(dx, dy)
      return {
        x: distance > 0 ? dx / distance : 0, y: distance > 0 ? dy / distance : 0, distance,
        target: { ...hand.target }, reachAmount: clamp(hand.reachAmount, 0, 1),
        activity: clamp(hand.activity, 0, 1), speed: clamp(hand.speed, 0, 1),
      }
    }
    this.poseInfluence = {
      viewport: { ...viewport },
      headTarget: null,
      left: clean(influence.left), right: clean(influence.right),
      head: {
        x: Number.isFinite(influence.head.x) ? clamp(influence.head.x, -1, 1) : 0,
        y: Number.isFinite(influence.head.y) ? clamp(influence.head.y, -1, 1) : 0,
      },
    }
  }

  getReachDiagnostics() {
    const { width, height } = this.poseInfluence.viewport
    const core = this.getCoreDiagnostics()
    const read = (side: HandSide) => {
      const hand = this.poseInfluence[side]
      const primaries = this.fibers.filter((fiber) => fiber.owner === side && fiber.role === 'primary')
      return {
        reach: hand?.reachAmount ?? 0,
        targetDistance: hand && hand.activity > 0.01
          ? Math.hypot(hand.target.x - width / 2 - core.x, hand.target.y - height / 2 - core.y) : 0,
        primaryLength: Math.max(0, ...primaries.map((fiber) =>
          Math.hypot(fiber.points[SEGMENTS * 2]!, fiber.points[SEGMENTS * 2 + 1]!) * this.drawScale)),
      }
    }
    return { left: read('left'), right: read('right') }
  }

  getCoreDiagnostics(width = this.poseInfluence.viewport.width, height = this.poseInfluence.viewport.height) {
    const position = this.presentation.position ?? { x: width / 2, y: height / 2 }
    const x = position.x - width / 2, y = position.y - height / 2
    return { x, y, position: { ...position }, distance: Math.hypot(x, y),
      velocity: this.presentation.velocity, state: this.presentation.state, activeHand: 'none', target: null as { x: number; y: number } | null }
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
    const delta = Math.min(deltaSeconds, 0.05)
    this.time += delta
    for (const key of ['energy', 'expansion', 'excitement'] as const) {
      // The response adapter owns the longer release; avoid another sluggish filter here.
      const follow = 1 - Math.exp(-delta / (this.target[key] > this.state[key] ? 0.12 : 0.18))
      this.state[key] += (this.target[key] - this.state[key]) * follow
    }
    for (const axis of ['x', 'y'] as const) {
      this.state.motionDirection[axis] +=
        (this.target.motionDirection[axis] - this.state.motionDirection[axis]) * (1 - Math.exp(-delta / 0.2))
      this.head[axis] = 0
    }
    this.updateHandTendrils(delta)

    // A drifting clock, asymmetric breath and varying depth avoid a fixed pulse.
    const pace = 0.76 + noise(this.time * 0.105, 11) * 0.43
    const greeting = Math.max(0, this.state.excitement - 0.04) / 0.96
    this.breathPhase += delta * pace * (1.0088 + greeting * 1.05)
    this.swayPhase += delta * (1.15 + greeting * 0.8)
  }

  private updateHandTendrils(delta: number): void {
    const { width, height } = this.poseInfluence.viewport
    const scale = Math.max(0.001, Math.min(1, Math.min(width, height) / 650))
    const rotation = this.head.x * 0.045
    const core = this.getCoreDiagnostics(width, height)
    const targets: Partial<Record<HandSide, { x: number; y: number }>> = {}
    const angles: Partial<Record<HandSide, number>> = {}
    for (const side of ['left', 'right'] as const) {
      const hand = this.poseInfluence[side]
      if (!hand || hand.activity < 0.01 || hand.reachAmount < 0.002) continue
      // The root follows the core; invert its moving transform to keep the wrist fixed in screen space.
      const x = (hand.target.x - width / 2 - core.x) / scale
      const y = (hand.target.y - height / 2 - core.y) / scale
      if (Math.hypot(x, y) < 0.001) continue
      targets[side] = { x: Math.cos(rotation) * x + Math.sin(rotation) * y,
        y: -Math.sin(rotation) * x + Math.cos(rotation) * y }
      angles[side] = Math.atan2(targets[side]!.y, targets[side]!.x)
    }
    const groups = selectTendrilGroups(this.fibers, angles, C.SECONDARY_PER_HAND)
    this.fibers.forEach((fiber, index) => {
      const group = groups.get(index)
      const hand = group ? this.poseInfluence[group.side] : null
      const target = group ? targets[group.side] : undefined
      let endpoint = { x: Math.cos(fiber.angle) * fiber.baseLength, y: Math.sin(fiber.angle) * fiber.baseLength }
      let blend = 0
      let strength = 0
      if (group && hand && target) {
        const distance = Math.hypot(target.x, target.y)
        // No base-length multiplier/cap: the goal is a fraction of real wrist distance.
        const desiredLength = fiber.baseLength + (distance * group.fraction - fiber.baseLength) * hand.reachAmount
        endpoint = { x: target.x / distance * desiredLength, y: target.y / distance * desiredLength }
        blend = hand.activity * Math.min(1, hand.reachAmount / 0.08)
        strength = hand.reachAmount * hand.activity
        fiber.owner = group.side
        fiber.role = group.role
      }
      fiber.endpoint.x = endpoint.x; fiber.endpoint.y = endpoint.y
      fiber.endpoint.vx = 0; fiber.endpoint.vy = 0
      fiber.currentLength = Math.hypot(fiber.endpoint.x, fiber.endpoint.y)
      fiber.reachBlend = blend
      if (!group && fiber.reachBlend < 0.001) { fiber.owner = null; fiber.role = null; fiber.reachBlend = 0 }
      fiber.handActivity += (strength - fiber.handActivity) * (1 - Math.exp(-delta / 0.08))
      fiber.handSpeed += ((hand?.speed ?? 0) * strength - fiber.handSpeed) * (1 - Math.exp(-delta / 0.12))
      let interest = 0
      for (const other of [this.poseInfluence.left, this.poseInfluence.right]) {
        if (other) interest += handAffinity(fiber.angle, other) * other.reachAmount * other.activity
          * (Math.cos(fiber.angle) * other.y - Math.sin(fiber.angle) * other.x)
      }
      fiber.curvature += (fiber.baseCurvature + interest * 4 - fiber.curvature) * (1 - Math.exp(-delta / 0.15))
    })
  }

  private breath(delay = 0): number {
    const wave = (Math.sin(this.breathPhase - delay) + 1) * 0.5
    const depth = 0.72 + noise(this.time * 0.14, 23) * 0.28
    return (wave ** 1.8 - 0.42) * depth
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    const scale = Math.min(1, Math.min(width, height) / 650)
    this.drawScale = scale
    const breath = this.breath()
    const coreOffset = this.getCoreDiagnostics(width, height)
    context.save()
    context.translate(width / 2 + coreOffset.x, height / 2 + coreOffset.y)
    context.globalAlpha = this.presentation.alpha
    context.scale(scale * this.presentation.scale, scale * this.presentation.scale)
    context.rotate(this.head.x * 0.045)
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (const fiber of this.fibers) this.drawFiber(context, fiber)

    const radius = 5.3 * C.CORE_SCALE * (1 + breath * 0.095 + this.state.energy * 0.06)
    const warmth = Math.max(0, this.state.energy - 0.18) + this.presentation.glow * 0.6
    const halo = context.createRadialGradient(0, 0, 0, 0, 0, C.CORE_GLOW)
    halo.addColorStop(0, `rgba(255, 235, 205, ${0.17 + warmth * 0.04 + this.presentation.glow * 0.1})`)
    halo.addColorStop(0.26, `rgba(246, 222, 191, ${0.065 + warmth * 0.025 + this.presentation.glow * 0.035})`)
    halo.addColorStop(0.65, 'rgba(237, 214, 185, 0.012)')
    halo.addColorStop(1, 'rgba(237, 214, 185, 0)')
    context.fillStyle = halo
    context.fillRect(-C.CORE_GLOW, -C.CORE_GLOW, C.CORE_GLOW * 2, C.CORE_GLOW * 2)

    context.save()
    context.rotate(-0.3 + noise(this.time * 0.1, 9) * 0.2)
    context.scale(1.08, 0.94 + breath * 0.025)
    const core = context.createRadialGradient(-0.3, -0.3, 0, 0, 0, radius * 2.6)
    core.addColorStop(0, `rgba(255, 246, 230, ${0.93 + warmth * 0.07})`)
    core.addColorStop(0.22, `rgba(255, 241, 218, ${0.81 + warmth * 0.1})`)
    core.addColorStop(0.43, `rgba(249, 229, 198, ${0.38 + warmth * 0.12})`)
    core.addColorStop(0.7, 'rgba(241, 216, 181, 0.065)')
    core.addColorStop(1, 'rgba(241, 216, 181, 0)')
    context.fillStyle = core
    context.beginPath()
    context.arc(0, 0, radius * 2.6, 0, TAU)
    context.fill()
    context.restore()
    context.restore()
  }

  private drawFiber(context: CanvasRenderingContext2D, fiber: Fiber): void {
    const { time, state } = this
    const breath = this.breath(fiber.delay)
    const cos = Math.cos(fiber.angle)
    const sin = Math.sin(fiber.angle)
    const affinity = clamp(cos * state.motionDirection.x + sin * state.motionDirection.y, 0, 1)
    const opening = Math.max(state.expansion, fiber.handActivity * 0.9)
    const greeting = Math.max(0, state.excitement - 0.04) / 0.96
    const extension = state.expansion * (1.06 + Math.sin(fiber.phase) * 0.12)
    const breathReach = 1 + breath * (0.037 + greeting * 0.035)
    // Move the two longitudinal Bezier controls by different amounts. The root
    // stays anchored while the middle and tip unfurl, instead of scaling the canvas.
    const control1 = fiber.baseLength / 3 * (1 + extension * 0.5)
    const control2 = fiber.baseLength * 2 / 3 * (1 + extension * 0.85)
    const end = fiber.baseLength * (1 + extension)
    const drift = (noise(time * 0.23, fiber.phase) - 0.5) * 1.5
    // Only two strands occasionally stir independently; the envelope fades smoothly.
    const impulse = fiber.restless
      ? Math.max(0, noise(time * 0.32, fiber.phase + 37) - 0.65) ** 2 * 20
      : 0
    for (let index = 0; index <= SEGMENTS; index++) {
      const u = index / SEGMENTS
      const tip = u ** 2.5
      // Phase modulation stays continuous while excitement changes.
      const twitch = Math.sin(time * (2.1 + fiber.phase * 0.16)
        + Math.sin(this.breathPhase + fiber.phase) * state.excitement * 0.5 + fiber.phase + u * 4)
        * (0.12 + noise(time * 0.4, fiber.phase + 4) * 0.2)
      const directionalReach = 1 + opening * affinity * 0.22 * ease(u)
      const forward = 1.7 + (3 * (1 - u) ** 2 * u * control1
        + 3 * (1 - u) * u ** 2 * control2 + u ** 3 * end) * breathReach * directionalReach
      const curveOpening = 1 + extension * (0.65 + ease(u) * 0.35)
      const freeSway = greeting * (
        Math.sin(this.swayPhase * (0.8 + fiber.delay * 0.3) + fiber.phase + u * 1.7) * 2.4
        + (noise(time * 0.45, fiber.phase + 61) - 0.5) * 1.6
      ) * u * Math.sin(u * Math.PI * 0.8)
      const livelyTip = (greeting + fiber.handSpeed * 1.8) * (1.1 + noise(time * 0.32, fiber.phase + 18) * 0.9)
        * Math.sin(this.swayPhase * (2.2 + fiber.delay) + fiber.phase + u * 3) * tip
      const side = (fiber.curvature * Math.sin(u * Math.PI * 0.85) * u * curveOpening
        + fiber.curl * u ** 3 * (1 + extension * 0.85)) * directionalReach
        + (fiber.curvature - fiber.baseCurvature) * u ** 2 * 0.9
        + Math.sin(u * TAU * 0.85 + fiber.phase) * Math.sin(u * Math.PI) * 1.6
        + (drift + twitch + impulse * Math.sin(time * 1.8 + fiber.phase)) * tip
          * (1 + state.excitement * 1.5 + affinity * 0.3)
        + (freeSway + livelyTip) * (1 + affinity * 0.2)
        + Math.sin(time * 65 + fiber.phase) * this.presentation.shiver * C.SHIVER_STRENGTH * u
      fiber.points[index * 2] = cos * forward - sin * side + state.motionDirection.x * tip * 2
      fiber.points[index * 2 + 1] = sin * forward + cos * side + state.motionDirection.y * tip * 2
      if (fiber.reachBlend > 0) {
        const length = Math.max(1, fiber.currentLength)
        const nx = -fiber.endpoint.y / length
        const ny = fiber.endpoint.x / length
        const bend = C.TENTACLE_NOISE * Math.sin(this.swayPhase + fiber.phase)
        const c1x = fiber.endpoint.x / 3
        const c1y = fiber.endpoint.y / 3
        const c2x = fiber.endpoint.x * 0.65 + nx * bend
        const c2y = fiber.endpoint.y * 0.65 + ny * bend
        const explore = Math.sin(this.swayPhase * 1.7 + fiber.phase) * (C.TENTACLE_NOISE + fiber.handSpeed * 2 + this.presentation.shiver * C.SHIVER_STRENGTH)
          / Math.max(0.1, this.drawScale) * u ** 3
        const reachX = (1 - u) ** 3 * cos * 1.7 + 3 * (1 - u) ** 2 * u * c1x
          + 3 * (1 - u) * u ** 2 * c2x + u ** 3 * fiber.endpoint.x + nx * explore
        const reachY = (1 - u) ** 3 * sin * 1.7 + 3 * (1 - u) ** 2 * u * c1y
          + 3 * (1 - u) * u ** 2 * c2y + u ** 3 * fiber.endpoint.y + ny * explore
        fiber.points[index * 2]! += (reachX - fiber.points[index * 2]!) * fiber.reachBlend
        fiber.points[index * 2 + 1]! += (reachY - fiber.points[index * 2 + 1]!) * fiber.reachBlend
      }
    }

    // Taper both width and opacity along the curve, all the way to black.
    // A faint wider pass softens the filament without a neon shadow blur.
    for (let pass = 0; pass < 2; pass++) {
      for (let index = 1; index <= SEGMENTS; index++) {
        const u = (index - 0.5) / SEGMENTS
        // Keep the opened outer curves legible, while the very ends still disappear.
        const fade = (1 - u) ** (1.15 - opening * 0.35 - fiber.reachBlend * 0.45) * (0.6 + Math.min(1, u * 6) * 0.4)
        context.strokeStyle = `rgba(239, 224, 201, ${fiber.opacity * fade
          * (0.86 + state.energy * 0.3) * (1 + opening * 0.65 + fiber.reachBlend * 0.4) * (pass === 0 ? 0.07 : 1)})`
        context.lineWidth = pass === 0 ? 2.2 : fiber.width * (1 - u * (0.7 - fiber.reachBlend * 0.35))
          * (1 + opening * 0.16) * (1 + fiber.reachBlend * (1 / Math.max(0.1, this.drawScale) - 1))
        context.beginPath()
        context.moveTo(fiber.points[(index - 1) * 2]!, fiber.points[(index - 1) * 2 + 1]!)
        context.lineTo(fiber.points[index * 2]!, fiber.points[index * 2 + 1]!)
        context.stroke()
      }
    }
  }
}
