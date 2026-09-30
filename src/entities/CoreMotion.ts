import type { PoseInfluence } from './PoseInfluence.ts'

/** The tracked nose owns position. Life comes from shape, never autonomous steering. */
export class CoreMotion {
  private position: { x: number; y: number } | null = null
  private viewport = { width: 1200, height: 900 }
  private velocity = { x: 0, y: 0 }
  private target: { x: number; y: number } | null = null
  getOffset() {
    return { x: (this.position?.x ?? this.viewport.width / 2) - this.viewport.width / 2,
      y: (this.position?.y ?? this.viewport.height / 2) - this.viewport.height / 2 }
  }
  getArousal(): number { return 0 }
  getDiagnostics() {
    return { velocity: { ...this.velocity }, state: this.target ? 'head tracking' : 'idle',
      activeHand: 'none', target: this.target ? { ...this.target } : null }
  }
  update(seconds: number, pose: PoseInfluence): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return
    if (this.position) {
      this.position.x *= pose.viewport.width / this.viewport.width
      this.position.y *= pose.viewport.height / this.viewport.height
    }
    this.viewport = { ...pose.viewport }
    const previous = this.position ?? { x: this.viewport.width / 2, y: this.viewport.height / 2 }
    this.target = pose.headTarget ?? null
    this.position = this.target ? { ...this.target } : { ...previous }
    this.velocity = { x: (this.position.x - previous.x) / seconds, y: (this.position.y - previous.y) / seconds }
  }
}
