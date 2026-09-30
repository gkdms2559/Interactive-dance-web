/** Positions use viewport fractions; radii use the shorter viewport dimension. */
export const ICE_CONFIG = {
  planets: [
    { x: 0.24, y: 0.27, radius: 0.091, color: '#a9d7c9', shade: '#67aaa3', topping: 'plain' },
    { x: 0.73, y: 0.21, radius: 0.070, color: '#f3c2b5', shade: '#d7959f', topping: 'plain' },
    { x: 0.51, y: 0.51, radius: 0.134, color: '#cfc1e5', shade: '#a498ce', topping: 'sprinkle' },
    { x: 0.20, y: 0.76, radius: 0.058, color: '#ece0c9', shade: '#c5b5a1', topping: 'cookie' },
    { x: 0.79, y: 0.75, radius: 0.080, color: '#b9dceb', shade: '#8cbacb', topping: 'sprinkle' },
  ] as const,
  palette: ['#dc82aa', '#e8af91', '#e5a05d', '#9bc6a5', '#58afa7', '#74acd0', '#b18aca', '#d8c66b', '#adc16c'],
  // Separate pigment recipes, rather than the same monochrome hatch on every planet.
  planetPigments: [
    { style: 'confetti', colors: ['#76c4b8', '#c0afe0', '#ec9cbb', '#d3d779'], rub: 0.72 },
    { style: 'marble', colors: ['#e986a0', '#f0b881', '#efd88e', '#f4c3c1'], rub: 1.0 },
    { style: 'cloud', colors: ['#aa8fc9', '#dcaacb', '#c8b9de', '#8f8bbd'], rub: 0.82 },
    { style: 'cookie', colors: ['#dfc9a6', '#bdaa91', '#f2e8d4', '#8c7967'], rub: 0.55 },
    { style: 'confetti', colors: ['#95cfcf', '#b4bbe3', '#e2b4d2', '#d0d88b'], rub: 0.65 },
  ] as const,
  pigmentStrength: 0.18,
  pigmentPaperGaps: 0.26,
  paperColor: '#fffefa',
  paperGrainStrength: 0.024,
  paperTileSize: 160,
  pixelRatioCap: 1.5,
  textureSize: 384,
  planetFloatAmount: 3,
  planetFloatSpeed: 0.3,
  planetReactionScale: 0.035,
  vineStrokeWidth: 2.65,
  branchStrokeRatio: 0.52,
  pencilPressureVariation: 0.26,
  vineGrowthSpeed: 115,
  vineCurlAmount: 1.05,
  curlStartMin: 0.60,
  curlStartMax: 0.82,
  vineMinLength: 90,
  vineMaxLength: 340,
  maxGrowingVines: 28,
  branchProbability: 0.82,
  branchesPerStem: 3,
  branchLength: 0.38,
  continuationProbability: 0.62,
  rememberedTipsPerPlanet: 12,
  movementThreshold: 0.008, // Screen diagonals from last accepted movement anchor.
  jitterStepThreshold: 0.0015,
  strongMovement: 0.045,
  handGrowthCooldown: 0.38,
  selectionCooldown: 0.65,
  selectionMargin: 0.055, // Diagonal-normalized improvement required to switch.
  secondaryReactionProbability: 0.42,
  secondaryCooldown: 1.4,
  starSpawnProbability: 0.52,
  starCooldown: 0.85,
  initialStarCount: 32,
  starMinSize: 2.5,
  starMaxSize: 9,
  largeStarProbability: 0.13,
  largeStarMinSize: 14,
  largeStarMaxSize: 28,
  starClusterProbability: 0.4,
  densityColumns: 14,
  densityRows: 10,
  densityBias: 0.38,
  densitySteeringInterval: 32,
  densityLookAhead: 100,
  maxDelta: 0.05,
} as const

export interface Point { x: number; y: number }
export const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export function seededRandom(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}
