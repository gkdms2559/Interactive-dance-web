import './style.css'
import { mountBlackCorePiece } from './pieces/black-core/mountBlackCorePiece'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app element')

const disposePiece = mountBlackCorePiece(app)

if (import.meta.hot) {
  import.meta.hot.dispose(disposePiece)
}
