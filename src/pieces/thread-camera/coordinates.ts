import { THREAD_CONFIG as C } from './config.ts'
import type { Point } from './config.ts'

/** Input is the mirrored inference image, matching CSS object-fit: cover + center + scaleX(-1). */
export function coverPoint(p: Point, sourceWidth: number, sourceHeight: number,
  width: number, height: number, mirror: boolean = C.CAMERA_MIRROR): Point {
  if (Math.min(sourceWidth, sourceHeight, width, height) <= 0) return { x: 0, y: 0 }
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  return { x: (mirror ? p.x : 1 - p.x) * sourceWidth * scale + (width - sourceWidth * scale) / 2,
    y: p.y * sourceHeight * scale + (height - sourceHeight * scale) / 2 }
}

/** Center of palm interior: halfway from wrist to the four MCP knuckles. */
export function palmCenter(points: Point[]): Point | null {
  const indices = [0, 5, 9, 13, 17]
  if (!indices.every(i => points[i] && Number.isFinite(points[i]!.x) && Number.isFinite(points[i]!.y))) return null
  const wrist = points[0]!
  const knuckles = indices.slice(1).map(i => points[i]!)
  const center = { x: wrist.x * 0.5 + knuckles.reduce((n, p) => n + p.x, 0) / 8,
    y: wrist.y * 0.5 + knuckles.reduce((n, p) => n + p.y, 0) / 8 }
  return center.x >= 0 && center.x <= 1 && center.y >= 0 && center.y <= 1 ? center : null
}
