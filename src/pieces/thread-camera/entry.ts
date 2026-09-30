import './style.css'
import { mountThreadCameraPiece } from './mountThreadCameraPiece'

const host = document.querySelector<HTMLDivElement>('#app')
if (!host) throw new Error('Missing #app element')
const dispose = mountThreadCameraPiece(host)
if (import.meta.hot) import.meta.hot.dispose(dispose)
