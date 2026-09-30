/** Future tracker emits raw normalized camera coordinates; no model is installed. */
export interface Fingertip { x: number; y: number; timestamp: number }
export interface HandTracker { start(onPoint: (point: Fingertip | null) => void): Promise<void>; stop(): void }
/** Matches object-fit: cover crop and horizontal mirror on the background video. */
export function fingertipToScreen(point: Fingertip, video: { width: number; height: number }, viewport: { width: number; height: number }) {
  const scale = Math.max(viewport.width / video.width, viewport.height / video.height)
  return { x: viewport.width / 2 + (.5 - point.x) * video.width * scale,
    y: viewport.height / 2 + (point.y - .5) * video.height * scale }
}
