import { canvas2d, pencilSegment, sparkle } from './pencil.ts'
import { ICE_CONFIG as C } from './config.ts'
import type { PencilSegment, Sparkle } from './PlanetDrawing.ts'

/** Permanent session bitmap. Only new marks are rasterized; no fade or path archive. */
export class DrawingLayer {
  private surface = canvas2d(1, 1)
  private width = 0
  private height = 0
  private ratio = 0
  resize(width: number, height: number, ratio: number): void {
    ratio = Math.min(C.pixelRatioCap, ratio)
    if (width === this.width && height === this.height && ratio === this.ratio) return
    const next = canvas2d(width * ratio, height * ratio)
    if (this.width > 0) next.context.drawImage(this.surface.canvas, 0, 0, next.canvas.width, next.canvas.height)
    next.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.surface = next; this.width = width; this.height = height; this.ratio = ratio
  }
  append(batch: { segments: PencilSegment[]; stars: Sparkle[] }): void {
    for (const segment of batch.segments) pencilSegment(this.surface.context, segment)
    for (const star of batch.stars) sparkle(this.surface.context, star)
  }
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.surface.canvas, 0, 0, this.width, this.height)
  }
  dispose(): void { this.surface.canvas.width = 1; this.surface.canvas.height = 1 }
}
