export const THREAD_CONFIG = {
  THREAD_COLOR: '#C96BCF',
  THREAD_WIDTH: 8, // CSS px; suggested range 6..10
  THREAD_GLOW: 0.12,
  PALM_SMOOTHING: 0.035, // Only sub-3px noise, seconds. Large movements are immediate.
  PALM_JITTER_PIXELS: 3,
  TRACKING_HOLD_TIME: 0.22,
  TRACKING_FADE_TIME: 0.22,
  TRACKING_REAPPEAR_TIME: 0.045,
  HAND_CONFIDENCE: 0.55,
  INFERENCE_FPS: 24,
  INFERENCE_WIDTH: 640,
  MODEL_TIMEOUT_MS: 45000,
  FRAME_TIMEOUT_MS: 5000,
  PARTICLE_MAX_COUNT: 100,
  PARTICLE_SPAWN_RATE: 23,
  PARTICLE_LIFETIME_MIN: 1.8,
  PARTICLE_LIFETIME_MAX: 4,
  PARTICLE_SIZE_MIN: 1,
  PARTICLE_SIZE_MAX: 4,
  PARTICLE_ALPHA: 0.28,
  PARTICLE_DRIFT: 5,
  PARTICLE_BAND: 42,
  PARTICLE_REACTION_TO_HAND_SPEED: 0.06,
  PARTICLE_COLORS: ['#fffaf0', '#ffffff', '#f9f0dc', '#f5e8f0', '#eee9f8'],
  CAMERA_MIRROR: true,
  PIXEL_RATIO_CAP: 2,
  DEBUG: false, // Console snapshot only, never an on-screen marker.
} as const

export interface Point { x: number; y: number }
export type Side = 'Left' | 'Right'
export interface DetectedHand { points: Point[]; side: Side; confidence: number }
export interface HandFrame { hands: DetectedHand[]; timestamp: number; epoch: number; width: number; height: number }
export type HandRequest = { type: 'init'; wasmRoot: string; modelUrl: string }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number; epoch: number }
export type HandReply = { type: 'ready' } | { type: 'error'; message: string }
  | ({ type: 'result' } & HandFrame)
