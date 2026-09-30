import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { PoseWorkerRequest, PoseWorkerReply } from './types'

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PoseWorkerRequest>) => void) | null
  postMessage(message: PoseWorkerReply): void
}
let landmarker: PoseLandmarker | undefined

worker.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(data.wasmRoot, true)
      landmarker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.modelUrl, delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      })
      worker.postMessage({ type: 'ready' })
    } else {
      try {
        if (!landmarker) throw new Error('Pose model is not ready')
        const started = performance.now()
        const result = landmarker.detectForVideo(data.bitmap, data.timestamp)
        try {
          const pose = result.landmarks[0]
          worker.postMessage({
            type: 'result', timestamp: data.timestamp, epoch: data.epoch,
            inferenceMs: performance.now() - started,
            landmarks: {
              imageAspect: data.bitmap.width / data.bitmap.height,
              nose: pose?.[0] ?? null,
              leftShoulder: pose?.[11] ?? null, rightShoulder: pose?.[12] ?? null,
              leftElbow: pose?.[13] ?? null, rightElbow: pose?.[14] ?? null,
              leftWrist: pose?.[15] ?? null, rightWrist: pose?.[16] ?? null,
            },
          })
        } finally { result.close() }
      } finally { data.bitmap.close() }
    }
  } catch (error) {
    landmarker?.close()
    landmarker = undefined
    worker.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
