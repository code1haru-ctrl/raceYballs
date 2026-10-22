/**
 * Stuck-marble detection (Phase 3B).
 *
 * The detector watches every racing marble and compares the progress it has
 * made along the centerline against the progress it had when the current
 * measurement window opened. A marble that fails to advance by
 * `MIN_PROGRESS_D` marble diameters inside `STUCK_WINDOW_S` is stuck.
 *
 * The detector is pure state plus arithmetic: it never touches the physics
 * world and never decides what to do about a stuck marble. Recovery and DNF
 * are the caller's business (see `recovery.ts`).
 */

import {
  CHECK_INTERVAL_S,
  GRACE_AFTER_START_S,
  MARBLE_DIAMETER,
  MAX_RECOVERY_ATTEMPTS,
  MIN_PROGRESS_D,
  RECOVERY_COOLDOWN_S,
  STUCK_WINDOW_S,
} from '../config'
import type { MarbleStatus } from './types'
import type { CenterlinePath } from './progress'

/** The minimum a marble has to expose for the detector to judge it. */
export interface StuckSample {
  x: number
  y: number
  status: MarbleStatus
}

export type StuckEvent =
  /** The marble is stuck and may be recovered (one attempt has been used). */
  | {
      kind: 'recover'
      index: number
      attempt: number
      bestProgress: number
      currentProgress: number
    }
  /** The marble is stuck and every recovery attempt has already been used. */
  | { kind: 'exhausted'; index: number; attempts: number; bestProgress: number }

interface MarbleTracker {
  /** Furthest progress ever reached along the centerline. */
  bestProgress: number
  /** Progress at the moment the current measurement window opened. */
  windowStartProgress: number
  /** Time at which the current measurement window opened. */
  windowStartTime: number
  /** Time of the last progress sample. */
  lastCheckTime: number
  /** Time of the last recovery attempt. */
  lastAttemptTime: number
  /** How many recovery attempts this marble has used. */
  attempts: number
  /** Set once the detector has reported the marble as out of attempts. */
  exhaustedReported: boolean
}

export interface StuckDetectorOptions {
  path: CenterlinePath
  /** Length of the progress measurement window, in seconds. */
  windowSec?: number
  /** Minimum progress inside the window, in world units. */
  minProgressUnits?: number
  /** How often progress is sampled, in seconds. */
  checkIntervalSec?: number
  /** Grace period after the start before detection is armed, in seconds. */
  graceSec?: number
  /** Cooldown between two recovery attempts of the same marble. */
  cooldownSec?: number
  /** Maximum number of recovery attempts per marble. */
  maxAttempts?: number
}

export class StuckDetector {
  /** The racing line the detector measures progress along. */
  readonly path: CenterlinePath
  private readonly windowSec: number
  private readonly minProgressUnits: number
  private readonly checkIntervalSec: number
  private readonly graceSec: number
  private readonly cooldownSec: number
  private readonly maxAttempts: number
  private trackers: MarbleTracker[] = []

  constructor(options: StuckDetectorOptions) {
    this.path = options.path
    this.windowSec = options.windowSec ?? STUCK_WINDOW_S
    this.minProgressUnits = options.minProgressUnits ?? MIN_PROGRESS_D * MARBLE_DIAMETER
    this.checkIntervalSec = options.checkIntervalSec ?? CHECK_INTERVAL_S
    this.graceSec = options.graceSec ?? GRACE_AFTER_START_S
    this.cooldownSec = options.cooldownSec ?? RECOVERY_COOLDOWN_S
    this.maxAttempts = options.maxAttempts ?? MAX_RECOVERY_ATTEMPTS
  }

  /** Number of recovery attempts already used by a marble. */
  attemptsFor(index: number): number {
    return this.trackers[index]?.attempts ?? 0
  }

  /** Best progress recorded for a marble, in world units along the line. */
  bestProgressFor(index: number): number {
    return this.trackers[index]?.bestProgress ?? 0
  }

  /** Clears every recorded measurement (used when a race restarts). */
  reset(): void {
    this.trackers = []
  }

  /**
   * Samples progress and returns the events produced by this tick.
   *
   * `simTime` is the simulated clock of the race, never wall-clock time.
   */
  update(simTime: number, marbles: readonly StuckSample[]): StuckEvent[] {
    const events: StuckEvent[] = []

    for (let index = 0; index < marbles.length; index += 1) {
      const marble = marbles[index]
      if (marble.status !== 'racing') continue

      const tracker = this.trackerFor(index)
      if (simTime - tracker.lastCheckTime < this.checkIntervalSec) continue
      tracker.lastCheckTime = simTime

      const progress = this.path.progressAt(marble.x, marble.y)
      if (progress > tracker.bestProgress) tracker.bestProgress = progress

      // The grace period keeps the marbles that are still jostling in the
      // start zone out of the detector entirely.
      if (simTime < this.graceSec) {
        tracker.windowStartTime = simTime
        tracker.windowStartProgress = tracker.bestProgress
        continue
      }

      if (simTime - tracker.windowStartTime < this.windowSec) continue

      const gained = tracker.bestProgress - tracker.windowStartProgress
      tracker.windowStartTime = simTime
      tracker.windowStartProgress = tracker.bestProgress

      if (gained >= this.minProgressUnits) continue

      if (tracker.attempts >= this.maxAttempts) {
        if (!tracker.exhaustedReported) {
          tracker.exhaustedReported = true
          events.push({
            kind: 'exhausted',
            index,
            attempts: tracker.attempts,
            bestProgress: tracker.bestProgress,
          })
        }
        continue
      }

      if (simTime - tracker.lastAttemptTime < this.cooldownSec) continue

      tracker.attempts += 1
      tracker.lastAttemptTime = simTime
      events.push({
        kind: 'recover',
        index,
        attempt: tracker.attempts,
        bestProgress: tracker.bestProgress,
        currentProgress: progress,
      })
    }

    return events
  }

  /**
   * Restarts the measurement window for a marble that has just been moved,
   * so the recovery spot counts as its new starting point.
   */
  noteRecovered(index: number, progress: number, simTime: number): void {
    const tracker = this.trackerFor(index)
    tracker.bestProgress = progress
    tracker.windowStartProgress = progress
    tracker.windowStartTime = simTime
    tracker.lastCheckTime = simTime
  }

  private trackerFor(index: number): MarbleTracker {
    while (this.trackers.length <= index) {
      this.trackers.push({
        bestProgress: 0,
        windowStartProgress: 0,
        windowStartTime: 0,
        lastCheckTime: 0,
        lastAttemptTime: Number.NEGATIVE_INFINITY,
        attempts: 0,
        exhaustedReported: false,
      })
    }
    return this.trackers[index]
  }
}
