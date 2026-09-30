export const BLACK_CONFIG = {
  CORE_SCALE: 2,
  CORE_GLOW: 64,
  CORE_SAFE_MARGIN: 58,
  DRIFT_SPEED: 24,
  HOP_POWER: 110,
  SHIVER_STRENGTH: 1.8,
  SPARKLE_STRENGTH: 0.7,
  DASH_SPEED: 220,
  BEHAVIORS: {
    REST: { min: 2.2, max: 4.5, weight: 34 },
    DRIFT: { min: 3, max: 6, weight: 40 },
    HOP: { min: 1.3, max: 1.8, weight: 10 },
    SHIVER: { min: 0.25, max: 0.55, weight: 7 },
    SPARKLE: { min: 0.8, max: 1.3, weight: 7 },
    DASH: { min: 0.45, max: 0.75, weight: 2 },
  },
  TENTACLE_COUNT: 64,
  TENTACLE_LENGTH: 2,
  TENTACLE_WIDTH: 1.05,
  TENTACLE_NOISE: 1.8,
  SECONDARY_PER_HAND: 7,
  PARTICLE_MAX_COUNT: 320,
  PARTICLE_SIZE: [0.7, 2.8],
  PARTICLE_ALPHA: 0.62,
  PARTICLE_LIFETIME: [2.5, 5.5],
  PARTICLE_GLOW: 6,
  PARTICLE_SPAWN_RATE: 38,
  PARTICLE_PER_PIXEL: 0.35,
  TENTACLE_SPARKLE_SPEED: 0.25,
  TENTACLE_SPARKLE_COOLDOWN: 0.5,
  ACTIVITY_THRESHOLD: 5,
  ACTIVITY_GAIN: 1,
  ACTIVITY_DECAY: 0.12,
  ACTIVITY_DEADZONE: 0.035, // Screen diagonals / second, measured from wrist samples.
  DOOR_POSITION: { x: 0.86, y: 0.20 },
  DOOR_SIZE: { width: 36, height: 72 },
  DOOR_OPEN_DURATION: 1.0,
  CORE_ENTER_DURATION: 0.65,
  DOOR_TRAVEL_SPEED: 290,
  WHITE_TRANSITION_DURATION: 1.6,
} as const

export interface Point { x: number; y: number }
export type Behavior = keyof typeof BLACK_CONFIG.BEHAVIORS
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
export const smooth = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t) }
