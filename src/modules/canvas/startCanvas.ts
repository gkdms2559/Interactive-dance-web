export interface CanvasEntity {
  update(deltaSeconds: number): void
  draw(context: CanvasRenderingContext2D, width: number, height: number): void
}

/** Owns the viewport and clock; entities work entirely in CSS pixels. */
export function startCanvas(canvas: HTMLCanvasElement, entity: CanvasEntity): () => void {
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas 2D is unavailable')

  let width = 0
  let height = 0
  let pixelRatio = 0
  let previousTime: number | undefined
  let frameId = 0
  let disposed = false

  const resize = () => {
    const bounds = canvas.getBoundingClientRect()
    width = bounds.width
    height = bounds.height
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(width * pixelRatio))
    canvas.height = Math.max(1, Math.round(height * pixelRatio))
    paint()
  }

  const paint = () => {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.fillStyle = '#000000'
    context.fillRect(0, 0, width, height)
    entity.draw(context, width, height)
  }

  const frame = (timestamp: number) => {
    if (disposed || document.hidden) return
    if (pixelRatio !== Math.min(window.devicePixelRatio || 1, 2)) resize()
    const delta = previousTime === undefined ? 0 : Math.min((timestamp - previousTime) / 1000, 0.05)
    previousTime = timestamp
    entity.update(delta)
    paint()
    frameId = requestAnimationFrame(frame)
  }

  const onVisibilityChange = () => {
    cancelAnimationFrame(frameId)
    previousTime = undefined
    if (!document.hidden) frameId = requestAnimationFrame(frame)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  document.addEventListener('visibilitychange', onVisibilityChange)
  resize()
  if (!document.hidden) frameId = requestAnimationFrame(frame)

  return () => {
    disposed = true
    cancelAnimationFrame(frameId)
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
