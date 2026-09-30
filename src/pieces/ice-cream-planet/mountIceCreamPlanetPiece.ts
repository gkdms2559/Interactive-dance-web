import { WebcamPoseDetector } from '../../modules/pose/WebcamPoseDetector'
import { PoseTracker } from '../../modules/pose/PoseTracker'
import { ICE_CONFIG as C } from './config'
import { PlanetDrawing } from './PlanetDrawing'
import { DrawingLayer } from './DrawingLayer'
import { paperTile, planetTexture, randomSparkle } from './pencil'

/** Independent lifecycle; shares only camera/landmark infrastructure with the black Piece. */
export function mountIceCreamPlanetPiece(host: HTMLElement): () => void {
  const canvas = document.createElement('canvas')
  canvas.className = 'ice-cream-planet-canvas'
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', '팔의 움직임으로 파스텔 덩굴이 자라는 다섯 개의 색연필 아이스크림 행성')
  host.replaceChildren(canvas)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D is unavailable')
  const model = new PlanetDrawing()
  const layer = new DrawingLayer()
  const textures = C.planets.map((_, index) => planetTexture(index))
  const paper = context.createPattern(paperTile(), 'repeat')
  const tracker = new PoseTracker()
  let width = 0, height = 0, ratio = 0, time = 0
  let frame = 0, previous: number | undefined, disposed = false, initialized = false
  const detector = new WebcamPoseDetector((landmarks, timestamp) => {
    if (!disposed) model.receive(tracker.receive(landmarks, timestamp, width, height), timestamp)
  }, {
    wasmRoot: new URL(`${import.meta.env.BASE_URL}mediapipe/wasm`, document.baseURI).href,
    modelUrl: new URL(`${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`, document.baseURI).href,
  })

  const paint = () => {
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = paper ?? C.paperColor
    context.fillRect(0, 0, width, height)
    layer.draw(context)
    textures.forEach((texture, index) => {
      const planet = model.planet(index)
      // Texture includes transparent border, keeping its pencil edge intact.
      const radius = planet.radius / 0.87 * (1 + planet.pulse * C.planetReactionScale
        + Math.sin(time * 0.45 + index) * 0.003)
      context.save()
      context.translate(planet.x, planet.y)
      context.rotate(Math.sin(time * 0.19 + index * 1.4) * 0.018)
      context.drawImage(texture, -radius, -radius, radius * 2, radius * 2)
      context.restore()
    })
  }
  const resize = () => {
    const bounds = canvas.getBoundingClientRect()
    const nextWidth = Math.max(1, bounds.width), nextHeight = Math.max(1, bounds.height)
    const nextRatio = Math.min(C.pixelRatioCap, window.devicePixelRatio || 1)
    if (width === nextWidth && height === nextHeight && ratio === nextRatio) return
    if (width !== nextWidth || height !== nextHeight) model.resize(nextWidth, nextHeight)
    width = nextWidth; height = nextHeight; ratio = nextRatio
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
    layer.resize(width, height, ratio)
    if (!initialized) {
      initialized = true
      layer.append({ segments: [], stars: Array.from({ length: C.initialStarCount }, () => {
        // Prefer open paper over planet interiors while retaining a loose, non-grid composition.
        let position = { x: 0, y: 0 }
        for (let attempt = 0; attempt < 8; attempt++) {
          position = { x: (0.06 + Math.random() * 0.88) * width, y: (0.06 + Math.random() * 0.88) * height }
          if (C.planets.every((_, i) => {
            const p = model.planet(i)
            return Math.hypot(position.x - p.x, position.y - p.y) > p.radius + C.largeStarMaxSize
          })) break
        }
        return randomSparkle(position)
      }) })
    }
    paint()
  }
  const tick = (timestamp: number) => {
    if (disposed || document.hidden) return
    if (ratio !== Math.min(C.pixelRatioCap, window.devicePixelRatio || 1)) resize()
    const dt = previous === undefined ? 0 : Math.min(C.maxDelta, (timestamp - previous) / 1000)
    previous = timestamp; time += dt
    model.update(dt)
    layer.append(model.drain())
    paint()
    frame = requestAnimationFrame(tick)
  }
  const visibility = () => {
    cancelAnimationFrame(frame); previous = undefined
    if (!document.hidden && !disposed) frame = requestAnimationFrame(tick)
  }
  const startCamera = () => { if (!disposed) void detector.start() }
  const stopCamera = () => detector.stop()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', stopCamera)
  window.addEventListener('pageshow', startCamera)
  resize(); visibility(); startCamera()

  return () => {
    if (disposed) return
    disposed = true
    detector.stop(); cancelAnimationFrame(frame); observer.disconnect()
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('pagehide', stopCamera)
    window.removeEventListener('pageshow', startCamera)
    layer.dispose()
    textures.forEach(texture => { texture.width = 1; texture.height = 1 })
    canvas.remove()
  }
}
