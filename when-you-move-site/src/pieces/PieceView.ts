import type { Piece } from '../gallery/galleryData.ts'
export function createPiece(piece: Piece): HTMLElement {
  const element = document.createElement('article')
  element.className = `piece piece--${piece.shape}`
  element.style.setProperty('--surface', piece.color); element.style.setProperty('--ink', piece.ink)
  element.innerHTML = `<div class="graphic" aria-hidden="true"><i></i><i></i><i></i></div><span class="piece-label">PIECE ${piece.id}</span>`
  return element
}
export class PieceView {
  readonly element = document.createElement('section')
  constructor() { this.element.className = 'play-view'; this.element.hidden = true }
  open(piece: Piece, origin: DOMRect): void {
    this.element.replaceChildren(createPiece(piece))
    const caption = document.createElement('p'); caption.textContent = 'Interactive Piece Placeholder'; caption.className = 'play-caption'
    this.element.append(caption); this.element.hidden = false
    const target = this.element.getBoundingClientRect()
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.element.animate([
      { transformOrigin: '0 0', transform: `translate(${origin.x - target.x}px, ${origin.y - target.y}px) scale(${origin.width / target.width}, ${origin.height / target.height})`, opacity: .8 },
      { transformOrigin: '0 0', transform: 'none', opacity: 1 },
    ], { duration: 650, easing: 'cubic-bezier(.22,.7,.2,1)' })
  }
  close(): void { this.element.hidden = true }
}
