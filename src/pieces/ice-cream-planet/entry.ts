import './style.css'
import { mountIceCreamPlanetPiece } from './mountIceCreamPlanetPiece'

const host = document.querySelector<HTMLDivElement>('#app')
if (!host) throw new Error('Missing #app element')
const dispose = mountIceCreamPlanetPiece(host)
if (import.meta.hot) import.meta.hot.dispose(dispose)
