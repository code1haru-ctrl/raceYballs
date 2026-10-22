/**
 * Centerline progress for a race track (Phase 3B).
 *
 * The centerline is the advisory racing line that runs from the start zone to
 * the finish line. Progress is measured in world units *along* that line: 0 at
 * the first point, `length` at the last one. The progress of a marble is the
 * arc length of the closest point on the centerline, so progress is a real
 * distance rather than a percentage and never depends on the renderer.
 *
 * The module is pure geometry: no engine, no DOM, no timing.
 */

export interface PathPoint {
  x: number
  y: number
}

/**
 * A polyline with arc-length parameterisation.
 *
 * `progressAt` projects a world point onto the line and returns the distance
 * travelled from the start; `pointAt` is the inverse and returns the world
 * point at a given distance.
 */
export class CenterlinePath {
  readonly points: readonly PathPoint[]
  /** Arc length at each point; `cumulative[0]` is always 0. */
  readonly cumulative: readonly number[]
  /** Total length of the line in world units. */
  readonly length: number

  constructor(points: readonly PathPoint[]) {
    this.points = points.map((point) => ({ x: point.x, y: point.y }))

    const cumulative: number[] = [0]
    let total = 0
    for (let i = 1; i < this.points.length; i += 1) {
      const a = this.points[i - 1]
      const b = this.points[i]
      total += Math.hypot(b.x - a.x, b.y - a.y)
      cumulative.push(total)
    }
    this.cumulative = cumulative
    this.length = total
  }

  /**
   * Distance travelled along the line by the closest point to `(x, y)`.
   *
   * A marble that has left the line still reports the progress of the line it
   * is nearest to, which is exactly what "how far did it get" means for the
   * stuck detector: the value stops growing while the marble is trapped.
   */
  progressAt(x: number, y: number): number {
    if (this.points.length < 2) return 0

    let bestProgress = 0
    let bestDistance = Number.POSITIVE_INFINITY

    for (let i = 0; i < this.points.length - 1; i += 1) {
      const a = this.points[i]
      const b = this.points[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSquared = dx * dx + dy * dy

      let t = 0
      if (lengthSquared > 0) {
        t = ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared
        if (t < 0) t = 0
        else if (t > 1) t = 1
      }

      const distance = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy))
      if (distance < bestDistance) {
        bestDistance = distance
        bestProgress = this.cumulative[i] + t * Math.sqrt(lengthSquared)
      }
    }

    return bestProgress
  }

  /** World point at `progress` units along the line (clamped to the line). */
  pointAt(progress: number): PathPoint {
    if (this.points.length === 0) return { x: 0, y: 0 }
    if (this.points.length === 1) return { ...this.points[0] }

    const clamped = Math.min(Math.max(progress, 0), this.length)

    for (let i = 0; i < this.points.length - 1; i += 1) {
      const start = this.cumulative[i]
      const end = this.cumulative[i + 1]
      const isLast = i === this.points.length - 2
      if (clamped > end && !isLast) continue

      const span = end - start
      const t = span > 0 ? (clamped - start) / span : 0
      const a = this.points[i]
      const b = this.points[i + 1]
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }

    return { ...this.points[this.points.length - 1] }
  }
}
