/**
 * Stuck-marble recovery (Phase 3B).
 *
 * When the detector reports a stuck marble, the recovery places the marble
 * back on the racing line so it can continue. The rules are deliberately
 * strict:
 *
 *  - a candidate is never ahead of the progress the marble already reached;
 *  - a candidate must keep at least `RECOVERY_CLEARANCE_D` marble diameters of
 *    clear space from every wall, bar and peg, so a marble is never dropped
 *    back into the pocket it just escaped;
 *  - a candidate must not sit on top of another marble;
 *  - attempts are bounded and rate-limited, and a marble whose attempts run
 *    out is a DNF — never a finisher.
 *
 * Everything here is engine-free geometry; the only engine call is the
 * teleport itself, which the simulation performs.
 */

import {
  MARBLE_DIAMETER,
  MARBLE_RADIUS,
  RECOVERY_CLEARANCE_D,
  RECOVERY_SAMPLE_STEP,
} from '../config'
import { pointRectDistance } from '../track/geometry'
import type { TrackData } from '../track/track'
import { CenterlinePath } from './progress'
import { StuckDetector, type StuckSample } from './stuck'
import type { MarbleRaceSimulation } from '../physics/MarbleRaceSimulation'
import type { DnfReason } from '../physics/MarbleRaceSimulation'

export interface RecoveryCandidate {
  x: number
  y: number
  /** Arc length along the centerline of the candidate spot. */
  progress: number
  /** Clear space between the marble surface and the nearest geometry. */
  clearance: number
}

export interface RecoveryEvent {
  index: number
  marbleId: string
  attempt: number
  from: { x: number; y: number }
  to: { x: number; y: number }
  progress: number
}

export interface RecoveryOptions {
  /** Minimum clearance from the track geometry, in world units. */
  minClearance?: number
  /** Spacing between candidate spots along the centerline. */
  sampleStep?: number
  /** Positions of the other marbles, which a candidate must not overlap. */
  occupied?: readonly { x: number; y: number }[]
}

/**
 * Clear space between a marble centred on `(x, y)` and the nearest piece of
 * track geometry. Negative when the point is inside a wall or an obstacle.
 */
export function geometryClearance(
  track: TrackData,
  x: number,
  y: number,
): number {
  let nearest = Number.POSITIVE_INFINITY

  for (const wall of track.walls) {
    nearest = Math.min(nearest, pointRectDistance(x, y, wall))
  }
  for (const bar of track.obstacles.bars) {
    nearest = Math.min(nearest, pointRectDistance(x, y, bar))
  }
  for (const peg of track.obstacles.pegs) {
    nearest = Math.min(nearest, Math.hypot(x - peg.cx, y - peg.cy) - peg.radius)
  }

  if (!Number.isFinite(nearest)) return Number.POSITIVE_INFINITY
  return nearest - MARBLE_RADIUS
}

/**
 * Finds the closest spot on the racing line that is not ahead of `bestProgress`
 * and that the marble can be dropped onto safely.
 *
 * The search walks backwards from `bestProgress` in `sampleStep` increments, so
 * the first accepted candidate is the one closest to the progress the marble
 * had already reached. `null` means no safe spot exists at or behind it.
 */
export function pickRecoveryCandidate(
  track: TrackData,
  path: CenterlinePath,
  bestProgress: number,
  options: RecoveryOptions = {},
): RecoveryCandidate | null {
  const minClearance = options.minClearance ?? RECOVERY_CLEARANCE_D * MARBLE_DIAMETER
  const sampleStep = Math.max(options.sampleStep ?? RECOVERY_SAMPLE_STEP, 0.01)
  const occupied = options.occupied ?? []

  const limit = Math.min(Math.max(bestProgress, 0), path.length)

  for (let progress = limit; progress >= 0; progress -= sampleStep) {
    const clamped = Math.max(progress, 0)
    const point = path.pointAt(clamped)
    const clearance = geometryClearance(track, point.x, point.y)
    if (clearance < minClearance) continue

    let blocked = false
    for (const other of occupied) {
      if (Math.hypot(point.x - other.x, point.y - other.y) < MARBLE_DIAMETER) {
        blocked = true
        break
      }
    }
    if (blocked) continue

    return { x: point.x, y: point.y, progress: clamped, clearance }
  }

  return null
}

/**
 * Drives the stuck detector and applies the recoveries it asks for.
 *
 * The manager is the only place that decides a marble is out of chances; it
 * asks the simulation to mark the marble as a DNF and never invents a finish.
 */
export class RecoveryManager {
  readonly detector: StuckDetector
  private readonly track: TrackData
  private readonly path: CenterlinePath
  private readonly minClearance: number
  private readonly sampleStep: number

  onRecover: ((event: RecoveryEvent) => void) | null = null

  constructor(track: TrackData, detector?: StuckDetector) {
    this.track = track
    this.path = detector
      ? detector.path
      : new CenterlinePath(track.centerline)
    this.detector = detector ?? new StuckDetector({ path: this.path })
    this.minClearance = RECOVERY_CLEARANCE_D * MARBLE_DIAMETER
    this.sampleStep = RECOVERY_SAMPLE_STEP
  }

  /** Clears the detector state (used when a race restarts). */
  reset(): void {
    this.detector.reset()
  }

  /** Runs one detection tick against the simulation. */
  update(sim: MarbleRaceSimulation): void {
    const samples: StuckSample[] = sim.marbles.map((marble) => ({
      x: marble.x,
      y: marble.y,
      status: marble.status,
    }))

    const events = this.detector.update(sim.elapsed(), samples)

    for (const event of events) {
      if (event.kind === 'exhausted') {
        sim.markDnf(event.index, 'recovery-failed')
        continue
      }

      const marble = sim.marbles[event.index]
      const occupied = sim.marbles
        .filter((_, index) => index !== event.index)
        .map((other) => ({ x: other.x, y: other.y }))

      const candidate = pickRecoveryCandidate(
        this.track,
        this.path,
        event.bestProgress,
        {
          minClearance: this.minClearance,
          sampleStep: this.sampleStep,
          occupied,
        },
      )

      // No safe spot: the attempt is still used up, so a marble that cannot
      // be rescued runs out of attempts and becomes a DNF.
      if (!candidate) continue

      const from = { x: marble.x, y: marble.y }
      if (!sim.teleportMarble(event.index, candidate.x, candidate.y)) continue

      this.detector.noteRecovered(event.index, candidate.progress, sim.elapsed())
      this.onRecover?.({
        index: event.index,
        marbleId: marble.id,
        attempt: event.attempt,
        from,
        to: { x: candidate.x, y: candidate.y },
        progress: candidate.progress,
      })
    }
  }
}

export type { DnfReason }
