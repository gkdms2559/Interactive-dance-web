import { THREAD_CONFIG as C } from './config.ts'
import type { ThreadState } from './PalmTracker.ts'

export function drawThread(ctx: CanvasRenderingContext2D, state: ThreadState): void {
  const { left, right, alpha } = state
  if (!left || !right || alpha < 0.002 || Math.hypot(right.x - left.x, right.y - left.y) < 0.01) return
  ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = C.THREAD_COLOR
  ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y)
  ctx.globalAlpha = alpha * C.THREAD_GLOW; ctx.lineWidth = C.THREAD_WIDTH + 2; ctx.stroke()
  ctx.globalAlpha = alpha; ctx.lineWidth = C.THREAD_WIDTH; ctx.stroke()
  ctx.restore()
}
