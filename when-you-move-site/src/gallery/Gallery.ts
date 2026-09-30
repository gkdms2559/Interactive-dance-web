import { pieces } from './galleryData.ts'
import { createPiece } from '../pieces/PieceView.ts'
export class Gallery {
  readonly element = document.createElement('section')
  private track = document.createElement('div')
  private position = pieces.length
  private timer = 0
  constructor() {
    this.element.className = 'gallery'; this.element.setAttribute('aria-label', 'Interactive pieces')
    this.track.className = 'gallery-track'
    for (let repeat = 0; repeat < 3; repeat++) for (const piece of pieces) this.track.append(createPiece(piece))
    this.element.append(this.track); this.place(false)
  }
  private place(animate: boolean): void {
    this.track.style.transition = animate ? '' : 'none'
    this.track.style.transform = `translate3d(calc(50vw - var(--piece-width) * ${this.position + .5}),0,0)`
    Array.from(this.track.children).forEach((child, i) => child.setAttribute('aria-hidden', String(i !== this.position)))
  }
  move(delta: number): void {
    clearTimeout(this.timer); this.position += delta; this.place(true)
    this.timer = window.setTimeout(() => {
      this.position = pieces.length + ((this.position % pieces.length) + pieces.length) % pieces.length
      this.place(false)
    }, 720)
  }
  currentRect(): DOMRect { return this.track.children[this.position]!.getBoundingClientRect() }
  dispose(): void { clearTimeout(this.timer) }
}
