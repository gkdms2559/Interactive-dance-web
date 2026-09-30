import './styles/global.css'
import './styles/camera.css'
import './styles/gallery.css'
import './styles/bubbles.css'
import { CameraFeed } from './camera/CameraFeed'
import { Gallery } from './gallery/Gallery'
import { pieces } from './gallery/galleryData'
import { PieceView } from './pieces/PieceView'
import { NavigationController } from './navigation/NavigationController'
import type { BubbleAction } from './navigation/NavigationController'
import { BubbleNavigation } from './navigation/BubbleNavigation'
import { createHeader } from './ui/Header'
import { createFooter } from './ui/Footer'
const host = document.querySelector<HTMLDivElement>('#app')!
const camera = new CameraFeed(), gallery = new Gallery(), play = new PieceView(), controller = new NavigationController(pieces.length)
const overlay = document.createElement('div'); overlay.className = 'camera-overlay'
const handOverlay = document.createElement('div'); handOverlay.className = 'hand-overlay'; handOverlay.setAttribute('aria-hidden', 'true')
const announcement = document.createElement('span'); announcement.className = 'sr-only'; announcement.setAttribute('aria-live', 'polite')
let actionTimer = 0
/** Shared entry for mouse, keyboard and a future hand input adapter. */
export function activateBubble(action: BubbleAction): void {
  if (!controller.activate(action)) return
  bubbles.pop(action)
  actionTimer = window.setTimeout(() => {
    if (action === 'prev' || action === 'next') gallery.move(action === 'next' ? 1 : -1)
    if (action === 'enter') { play.open(pieces[controller.index]!, gallery.currentRect()); host.classList.add('is-playing'); bubbles.setMode('play'); bubbles.focus('back') }
    if (action === 'back') { play.close(); host.classList.remove('is-playing'); bubbles.setMode('gallery'); bubbles.focus('enter') }
    announcement.textContent = `Piece ${pieces[controller.index]!.id}, ${controller.mode === 'play' ? 'play mode' : 'gallery'}`
  }, 110)
}
const bubbles = new BubbleNavigation(activateBubble)
host.append(camera.video, overlay, createHeader(), gallery.element, createFooter(), bubbles.element, play.element, handOverlay, camera.notice, announcement)
const start = () => { void camera.start() }, stop = () => camera.stop()
const restore = (event: PageTransitionEvent) => { if (event.persisted) start() }
window.addEventListener('pagehide', stop)
window.addEventListener('pageshow', restore)
start()
if (import.meta.hot) import.meta.hot.dispose(() => { clearTimeout(actionTimer); camera.stop(); gallery.dispose(); bubbles.dispose(); window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', restore); host.replaceChildren() })
