import { ICE_CONFIG as C, seededRandom } from './config.ts'
import type { PencilSegment, Sparkle } from './PlanetDrawing.ts'

export function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is unavailable')
  return { canvas, context }
}

/** Three lightly displaced graphite-like passes, rasterized only once per new mark. */
export function pencilSegment(ctx: CanvasRenderingContext2D, segment: PencilSegment): void {
  ctx.strokeStyle = segment.color
  ctx.lineCap = 'round'
  const pressure = 1 + Math.sin(segment.seed * 0.53) * C.pencilPressureVariation
  const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y
  const length = Math.max(0.01, Math.hypot(dx, dy))
  for (let pass = 0; pass < 3; pass++) {
    const spread = Math.sin(segment.seed * 0.31 + pass * 2.1) * segment.width * 0.26
    const offsetX = -dy / length * spread, offsetY = dx / length * spread
    ctx.globalAlpha = (pass === 0 ? 0.24 : 0.34) * pressure
    ctx.lineWidth = segment.width * pressure * (pass === 0 ? 1 : pass === 1 ? 0.43 : 0.21)
    // Fine pigment strands intermittently miss the paper; the broad underlay stays connected.
    const gap = pass === 0 ? 0 : (Math.sin(segment.seed * 3.7 + pass) + 1) * 0.16
    ctx.beginPath()
    ctx.moveTo(segment.a.x + offsetX + dx * gap, segment.a.y + offsetY + dy * gap)
    ctx.lineTo(segment.b.x + offsetX - dx * gap, segment.b.y + offsetY - dy * gap)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

export function sparkle(ctx: CanvasRenderingContext2D, star: Sparkle): void {
  const { x, y } = star.position, r = star.size
  const random = seededRandom(Math.round(x * 71 + y * 113 + r * 19))
  if (star.kind === 2) {
    ctx.fillStyle = star.color; ctx.globalAlpha = 0.55
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.22, r * 0.17, 0.5, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    return
  }
  const rotation = (random() - 0.5) * 0.45
  const points = Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4 - Math.PI / 2 + rotation
    const length = (i % 2 ? r * (star.kind === 1 ? 0.34 : 0.18) : r) * (0.88 + random() * 0.22)
    return { x: x + Math.cos(angle) * length * (star.kind === 1 ? 0.47 : 0.85), y: y + Math.sin(angle) * length }
  })
  ctx.save()
  ctx.beginPath(); ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y)
  ctx.closePath(); ctx.clip()
  ctx.fillStyle = star.color; ctx.globalAlpha = 0.12
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.strokeStyle = star.color
  for (let i = 0; i < Math.min(140, r * 6); i++) {
    const px = x - r + random() * r * 2, py = y - r + random() * r * 2
    ctx.globalAlpha = 0.15 + random() * 0.28; ctx.lineWidth = 0.45 + random() * 0.65
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + r * 0.45, py - r * 0.3); ctx.stroke()
  }
  ctx.restore()
  for (let i = 0; i < points.length; i++) pencilSegment(ctx, {
    a: points[i]!, b: points[(i + 1) % points.length]!, color: star.color, width: 0.95, seed: x + i,
  })
}

export function randomSparkle(position: Sparkle['position'], random = Math.random): Sparkle {
  const large = random() < C.largeStarProbability
  return { position, color: C.palette[Math.floor(random() * C.palette.length)]!,
    size: large ? C.largeStarMinSize + random() * (C.largeStarMaxSize - C.largeStarMinSize)
      : C.starMinSize + random() * (C.starMaxSize - C.starMinSize),
    kind: large ? Math.floor(random() * 2) : Math.floor(random() * 3) }
}

export function paperTile(): HTMLCanvasElement {
  const { canvas, context: ctx } = canvas2d(C.paperTileSize, C.paperTileSize)
  const random = seededRandom(195)
  ctx.fillStyle = C.paperColor; ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < 4500; i++) {
    ctx.fillStyle = i % 3 ? `rgba(144,127,105,${random() * C.paperGrainStrength})` : 'rgba(255,255,255,0.5)'
    ctx.fillRect(random() * canvas.width, random() * canvas.height, 0.5 + random(), 0.5 + random())
  }
  return canvas
}

/** Pre-baked pencil pigment: irregular silhouette, cross-hatching and flecks, no glossy sphere shading. */
export function planetTexture(index: number): HTMLCanvasElement {
  const { canvas, context: ctx } = canvas2d(C.textureSize, C.textureSize)
  const random = seededRandom(801 + index * 91), planet = C.planets[index]!
  const recipe = C.planetPigments[index]!
  const center = C.textureSize / 2, radius = center * 0.87
  const boundary = (angle: number) => radius * (1 + Math.sin(angle * 5 + index) * 0.014 + Math.sin(angle * 9 - index) * 0.009)
  ctx.beginPath()
  for (let i = 0; i <= 120; i++) {
    const angle = i / 120 * Math.PI * 2, r = boundary(angle)
    const x = center + Math.cos(angle) * r, y = center + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.closePath(); ctx.save(); ctx.clip()
  ctx.globalAlpha = 0.43; ctx.fillStyle = planet.color; ctx.fillRect(0, 0, C.textureSize, C.textureSize)
  // Uneven patches under the hatch read as pigment overlap rather than a light source.
  for (let i = 0; i < 45; i++) {
    ctx.globalAlpha = 0.02 + random() * C.pigmentStrength * 0.6
    ctx.fillStyle = recipe.colors[i % recipe.colors.length]!
    ctx.beginPath(); ctx.ellipse(random() * C.textureSize, random() * C.textureSize,
      12 + random() * 80, 8 + random() * 40, random() * Math.PI, 0, Math.PI * 2); ctx.fill()
  }
  // Curved rubbing follows the round body, layered with separate pencil colors.
  for (let i = 0; i < 4300; i++) {
    const angle = random() * Math.PI * 2, radial = Math.sqrt(random()) * radius
    const x = center + Math.cos(angle) * radial, y = center + Math.sin(angle) * radial
    const pigment = recipe.style === 'marble'
      ? Math.floor((Math.sin(angle * 2 + radial * 0.035) + 1) * 1.99)
      : Math.floor((Math.sin(x * 0.028 + Math.sin(y * 0.035)) + 1) * 1.99)
    ctx.strokeStyle = i % 4 === 0 ? planet.color : recipe.colors[pigment]!
    ctx.globalAlpha = (0.07 + random() * C.pigmentStrength) * recipe.rub
    ctx.lineWidth = 0.6 + random() * 1.4
    const sweep = 0.08 + random() * 0.23
    ctx.beginPath()
    ctx.ellipse(center + Math.sin(angle * 3) * 14, center + Math.cos(angle * 2) * 12,
      Math.max(2, radial), Math.max(2, radial * (0.86 + random() * 0.1)), 0.1,
      angle, angle + sweep)
    ctx.stroke()
  }
  for (let i = 0; i < 2600; i++) {
    const x = random() * C.textureSize, y = random() * C.textureSize
    const edge = Math.min(1, Math.hypot(x - center, y - center) / radius)
    ctx.globalAlpha = 0.04 + random() * 0.10 + edge * 0.035
    ctx.strokeStyle = i % 5 === 0 ? '#fffefa' : i % 3 ? planet.color : planet.shade
    ctx.lineWidth = 0.4 + random() * 0.8
    const length = 3 + random() * 23, tilt = i % 4 === 0 ? -0.6 : 0.6
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + length, y - length * tilt); ctx.stroke()
  }
  for (let i = 0; i < 2000; i++) {
    ctx.globalAlpha = random() * C.pigmentPaperGaps
    ctx.fillStyle = i % 4 ? '#fffefa' : planet.shade
    ctx.fillRect(random() * C.textureSize, random() * C.textureSize, random() * 1.6, random() * 1.2)
  }
  // Loose patches of colored crumbs retain ragged edges rather than geometric dots.
  if (recipe.style === 'confetti' || recipe.style === 'cloud' || recipe.style === 'cookie') {
    const count = recipe.style === 'cloud' ? 12 : recipe.style === 'cookie' ? 32 : 22
    for (let i = 0; i < count; i++) {
      const x = center + (random() - 0.5) * radius * 1.9, y = center + (random() - 0.5) * radius * 1.9
      const size = recipe.style === 'cookie' ? 2 + random() * 10 : 4 + random() * 11
      const color = recipe.style === 'cookie' ? '#857464' : recipe.colors[i % recipe.colors.length]!
      for (let mark = 0; mark < 35; mark++) {
        const angle = random() * Math.PI * 2, d = Math.sqrt(random()) * size
        ctx.strokeStyle = color; ctx.globalAlpha = 0.08 + random() * 0.22; ctx.lineWidth = 0.6 + random()
        ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * d, y + Math.sin(angle) * d * 0.7)
        ctx.lineTo(x + Math.cos(angle) * d + 2 + random() * 4, y + Math.sin(angle) * d * 0.7 - 2); ctx.stroke()
      }
    }
  }
  if (planet.topping !== 'plain') for (let i = 0; i < (planet.topping === 'cookie' ? 90 : 45); i++) {
    const x = random() * C.textureSize, y = random() * C.textureSize
    ctx.globalAlpha = 0.35 + random() * 0.25
    if (planet.topping === 'cookie') {
      ctx.fillStyle = '#918375'
      ctx.beginPath(); ctx.ellipse(x, y, 0.8 + random() * 2.4, 0.7 + random() * 1.6, random() * 3, 0, Math.PI * 2); ctx.fill()
    } else {
      ctx.strokeStyle = C.palette[Math.floor(random() * C.palette.length)]!
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (random() - 0.5) * 8, y + (random() - 0.5) * 8); ctx.stroke()
    }
  }
  ctx.restore()
  for (let pass = 0; pass < 3; pass++) {
    ctx.strokeStyle = planet.shade; ctx.globalAlpha = 0.14; ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let i = 0; i <= 180; i++) {
      const angle = i / 180 * Math.PI * 2, r = boundary(angle) + Math.sin(i * 0.8 + pass) * 1.1 + pass * 0.6
      const x = center + Math.cos(angle) * r, y = center + Math.sin(angle) * r
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  return canvas
}
