export interface PoseLandmark {
  x: number
  y: number
  visibility?: number
  presence?: number
}

export interface PoseLandmarks {
  imageAspect?: number
  nose: PoseLandmark | null
  leftShoulder: PoseLandmark | null
  rightShoulder: PoseLandmark | null
  leftElbow?: PoseLandmark | null
  rightElbow?: PoseLandmark | null
  leftWrist: PoseLandmark | null
  rightWrist: PoseLandmark | null
}

export interface TrackedPoint {
  /** Mirrored, normalized screen coordinates. Anatomical left/right labels are retained. */
  x: number
  y: number
  /** Screen diagonals per second, with a small jitter dead zone. */
  speed: number
}

export interface TrackedPose {
  detected: boolean
  imageAspect: number
  nose: TrackedPoint | null
  leftShoulder: TrackedPoint | null
  rightShoulder: TrackedPoint | null
  leftElbow?: TrackedPoint | null
  rightElbow?: TrackedPoint | null
  leftWrist: TrackedPoint | null
  rightWrist: TrackedPoint | null
}

export const noPose = (): TrackedPose => ({
  detected: false, imageAspect: 1, nose: null, leftShoulder: null, rightShoulder: null,
  leftWrist: null, rightWrist: null,
})

export type PoseWorkerRequest =
  | { type: 'init'; wasmRoot: string; modelUrl: string }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number; epoch: number }

export type PoseWorkerReply =
  | { type: 'ready' }
  | { type: 'result'; landmarks: PoseLandmarks; timestamp: number; epoch: number; inferenceMs: number }
  | { type: 'error'; message: string }
