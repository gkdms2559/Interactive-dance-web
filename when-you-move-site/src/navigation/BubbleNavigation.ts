import type { BubbleAction } from './NavigationController.ts'
export interface BubbleTarget { action: BubbleAction; x: number; y: number; hitRadius: number }
export function hitBubble(point: { x: number; y: number }, targets: BubbleTarget[]): BubbleTarget | undefined {
  return targets.find(target => Math.hypot(point.x - target.x, point.y - target.y) <= target.hitRadius)
}
export class BubbleNavigation {
  readonly element = document.createElement('nav')
  private buttons = new Map<BubbleAction, HTMLButtonElement>()
  private timers = new Set<number>()
  private activate: (action: BubbleAction) => void
  constructor(activate: (action: BubbleAction) => void) {
    this.activate = activate; this.element.className = 'bubble-navigation'; this.element.setAttribute('aria-label', 'Gallery navigation')
    const labels = { prev: '←', enter: 'ENTER', next: '→', back: 'BACK' }
    for (const action of ['prev', 'enter', 'next', 'back'] as const) {
      const button = document.createElement('button'); button.className = `bubble bubble--${action}`
      button.type = 'button'; button.setAttribute('aria-label', { prev: 'Previous piece', next: 'Next piece', enter: 'Play selected piece', back: 'Back to gallery' }[action])
      button.innerHTML = `<span class="bubble-film"><span>${labels[action]}</span></span><span class="pop-ripple"></span><span class="droplets"><i></i><i></i><i></i><i></i></span>`
      button.addEventListener('click', event => {
        if (event.detail === 0 || hitBubble({ x: event.clientX, y: event.clientY }, this.targets())?.action === action) this.activate(action)
      })
      this.buttons.set(action, button); this.element.append(button)
    }
    this.setMode('gallery')
    window.addEventListener('pointermove', this.onMove); window.addEventListener('blur', this.clearHover)
    document.addEventListener('pointerleave', this.clearHover)
  }
  targets(): BubbleTarget[] {
    return [...this.buttons].filter(([, button]) => !button.hidden).map(([action, button]) => {
      const rect = button.getBoundingClientRect()
      return { action, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, hitRadius: Math.min(rect.width, rect.height) / 2 }
    })
  }
  private onMove = (event: PointerEvent) => { const hit = hitBubble({ x: event.clientX, y: event.clientY }, this.targets()); this.buttons.forEach((button, action) => button.classList.toggle('is-near', hit?.action === action)) }
  private clearHover = () => this.buttons.forEach(button => button.classList.remove('is-near'))
  pop(action: BubbleAction): void {
    const button = this.buttons.get(action)!
    button.classList.add('is-popping')
    const timer = window.setTimeout(() => { button.classList.remove('is-popping'); this.timers.delete(timer) }, 300)
    this.timers.add(timer)
  }
  setMode(mode: 'gallery' | 'play'): void {
    this.buttons.forEach((button, action) => { button.hidden = mode === 'play' ? action !== 'back' : action === 'back' })
    this.element.classList.toggle('in-play', mode === 'play')
  }
  focus(action: BubbleAction): void { this.buttons.get(action)?.focus({ preventScroll: true }) }
  dispose(): void {
    this.timers.forEach(clearTimeout); window.removeEventListener('pointermove', this.onMove); window.removeEventListener('blur', this.clearHover); document.removeEventListener('pointerleave', this.clearHover)
  }
}
