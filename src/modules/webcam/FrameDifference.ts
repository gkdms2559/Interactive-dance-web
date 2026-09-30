export interface MotionSample {
  intensity: number
  /** Screen coordinates, mirrored horizontally like a mirror by default. */
  direction: { x: number; y: number }
  regions: [number, number, number]
}

export const quietMotion = (): MotionSample => ({
  intensity: 0,
  direction: { x: 0, y: 0 },
  regions: [0, 0, 0],
})

export interface FrameDifferenceDiagnostics {
  frames: number
  comparisons: number
  meanDifference: number
  noiseThreshold: number
  changedFraction: number
  intensity: number
}

const MIN_PIXEL_THRESHOLD = 4
const ACTIVITY_FLOOR = 0.0015
const SENSITIVITY = 0.035

/** Low-resolution luminance differences; no images leave this module. */
export class FrameDifference {
  private previous: Float32Array | undefined
  private readonly width: number
  private readonly height: number
  private readonly mirrorX: boolean
  private diagnostics: FrameDifferenceDiagnostics = {
    frames: 0, comparisons: 0, meanDifference: 0,
    noiseThreshold: MIN_PIXEL_THRESHOLD, changedFraction: 0, intensity: 0,
  }

  constructor(width: number, height: number, mirrorX = true) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error('Frame dimensions must be positive integers')
    }
    this.width = width
    this.height = height
    this.mirrorX = mirrorX
  }

  reset(): void {
    this.previous = undefined
    this.diagnostics = {
      ...this.diagnostics, meanDifference: 0, noiseThreshold: MIN_PIXEL_THRESHOLD,
      changedFraction: 0, intensity: 0,
    }
  }

  getDiagnostics(): FrameDifferenceDiagnostics {
    return { ...this.diagnostics }
  }

  analyze(rgba: Uint8ClampedArray): MotionSample {
    const count = this.width * this.height
    if (rgba.length !== count * 4) throw new Error('Unexpected frame dimensions')
    const luminance = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      luminance[i] = rgba[i * 4]! * 0.2126 + rgba[i * 4 + 1]! * 0.7152 + rgba[i * 4 + 2]! * 0.0722
    }
    // A small spatial filter removes isolated sensor noise before lowering sensitivity.
    const current = new Float32Array(count)
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const row = Math.max(0, Math.min(this.height - 1, y + dy))
        const column = Math.max(0, Math.min(this.width - 1, x + dx))
        sum += luminance[row * this.width + column]! * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1)
      }
      current[y * this.width + x] = sum / 16
    }
    this.diagnostics.frames++
    const previous = this.previous
    this.previous = current
    if (!previous) return quietMotion()

    // Median exposure shift is not pulled toward a moving arm as the old mean was.
    const shifts = new Uint32Array(511)
    for (let i = 0; i < count; i++) shifts[Math.round(current[i]! - previous[i]!) + 255]!++
    const median = (histogram: Uint32Array) => {
      let total = 0
      for (let i = 0; i < histogram.length; i++) {
        total += histogram[i]!
        if (total >= count / 2) return i
      }
      return 0
    }
    const exposureChange = median(shifts) - 255
    const residuals = new Uint32Array(511)
    for (let i = 0; i < count; i++) {
      residuals[Math.round(Math.abs(current[i]! - previous[i]! - exposureChange))]!++
    }
    const threshold = Math.max(MIN_PIXEL_THRESHOLD, median(residuals) * 2.5)
    const regions: [number, number, number] = [0, 0, 0]
    let mass = 0
    let verticalMass = 0
    let changed = 0
    let differenceSum = 0
    for (let i = 0; i < count; i++) {
      const difference = Math.abs(current[i]! - previous[i]! - exposureChange)
      differenceSum += difference
      const weight = Math.min(1, Math.max(0, difference - threshold) / 32)
      if (weight === 0) continue
      changed++
      const cameraX = (i % this.width + 0.5) / this.width
      const screenX = this.mirrorX ? 1 - cameraX : cameraX
      const region = Math.min(2, Math.floor(screenX * 3))
      regions[region]! += weight
      mass += weight
      verticalMass += weight * (((Math.floor(i / this.width) + 0.5) / this.height) * 2 - 1)
    }

    // Soft saturation keeps ordinary low-contrast motion visible and larger motion stronger.
    const intensity = 1 - Math.exp(-Math.max(0, mass / count - ACTIVITY_FLOOR) / SENSITIVITY)
    this.diagnostics = {
      frames: this.diagnostics.frames, comparisons: this.diagnostics.comparisons + 1,
      meanDifference: differenceSum / count, noiseThreshold: threshold,
      changedFraction: changed / count, intensity,
    }
    return {
      intensity,
      direction: intensity > 0 && mass > 0
        ? { x: (regions[2] - regions[0]) / mass, y: verticalMass / mass }
        : { x: 0, y: 0 },
      regions: regions.map((value) => value / count) as [number, number, number],
    }
  }
}
