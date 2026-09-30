import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { HandRequest, HandReply, DetectedHand } from './config'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<HandRequest>) => void) | null
  postMessage(message: HandReply): void
}
let model: HandLandmarker | undefined
let surface: OffscreenCanvas | undefined

scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      model = await HandLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(data.wasmRoot, true), {
        baseOptions: { modelAssetPath: data.modelUrl, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      })
      scope.postMessage({ type: 'ready' })
    } else {
      try {
        if (!model) throw new Error('Hand model is not ready')
        const { width, height } = data.bitmap
        if (!surface || surface.width !== width || surface.height !== height) surface = new OffscreenCanvas(width, height)
        const ctx = surface.getContext('2d')
        if (!ctx) throw new Error('Hand input canvas is unavailable')
        // Inference sees a selfie image too. Handedness and normalized landmarks share that convention.
        ctx.setTransform(-1, 0, 0, 1, width, 0)
        ctx.drawImage(data.bitmap, 0, 0)
        const result = model.detectForVideo(surface, data.timestamp)
        const hands: DetectedHand[] = result.landmarks.map((points, i) => ({
          points: points.map(p => ({ x: p.x, y: p.y })),
          side: result.handedness[i]?.[0]?.categoryName === 'Left' ? 'Left' : 'Right',
          confidence: result.handedness[i]?.[0]?.score ?? 0,
        }))
        scope.postMessage({ type: 'result', hands, timestamp: data.timestamp, epoch: data.epoch, width, height })
      } finally { data.bitmap.close() }
    }
  } catch (error) {
    model?.close(); model = undefined
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
