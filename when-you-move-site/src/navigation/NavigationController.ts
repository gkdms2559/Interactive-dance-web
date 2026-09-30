export type BubbleAction = 'prev' | 'next' | 'enter' | 'back'
export class NavigationController {
  index = 0
  mode: 'gallery' | 'play' = 'gallery'
  private busyUntil = 0
  private count: number
  constructor(count = 5) { this.count = count }
  activate(action: BubbleAction, now = performance.now()): boolean {
    if (now < this.busyUntil) return false
    if (this.mode === 'gallery' && action === 'back' || this.mode === 'play' && action !== 'back') return false
    if (action === 'prev') this.index = (this.index - 1 + this.count) % this.count
    if (action === 'next') this.index = (this.index + 1) % this.count
    if (action === 'enter') this.mode = 'play'
    if (action === 'back') this.mode = 'gallery'
    this.busyUntil = now + 850
    return true
  }
}
