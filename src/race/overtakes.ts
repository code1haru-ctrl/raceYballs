/**
 * Overtake detection (Phase 5).
 *
 * The detector ranks the ACTIVE marbles by their progress along the track
 * centerline. A swap only becomes an event when:
 *
 *  - both marbles are still racing (finished and DNF marbles are ignored);
 *  - the progress gap is at least `minMargin` world units;
 *  - the new order has held for `holdMs` of real time.
 *
 * The hold time is real time, not simulation time, so a 3x race does not
 * produce three times as many overtake sounds. The module is pure state plus
 * arithmetic: it never reads the clock or the physics world itself.
 */

import {
  OVERTAKE_HOLD_MS,
  OVERTAKE_MIN_PROGRESS_MARGIN,
} from '../config'
import type { MarbleStatus } from './types'

export interface OvertakeSample {
  id: string
  /** Arc-length progress along the centerline. */
  progress: number
  status: MarbleStatus
}

export interface Overtake {
  overtakerId: string
  overtakenId: string
  margin: number
}

export interface OvertakeDetectorOptions {
  /** Minimum progress gap for a swap to count, in world units. */
  minMargin?: number
  /** How long the new order has to hold, in milliseconds (real time). */
  holdMs?: number
}

interface PendingOrder {
  ids: string[]
  since: number
}

export class OvertakeDetector {
  private readonly minMargin: number
  private readonly holdMs: number
  private confirmed: string[] | null = null
  private pending: PendingOrder | null = null

  constructor(options: OvertakeDetectorOptions = {}) {
    this.minMargin = options.minMargin ?? OVERTAKE_MIN_PROGRESS_MARGIN
    this.holdMs = options.holdMs ?? OVERTAKE_HOLD_MS
  }

  /** Forgets the current ranking; the next update becomes the new baseline. */
  reset(): void {
    this.confirmed = null
    this.pending = null
  }

  /**
   * Feeds one real-time sample and returns the swaps that became confirmed.
   *
   * `nowMs` is wall-clock (or injected test) time in milliseconds.
   */
  update(samples: readonly OvertakeSample[], nowMs: number): Overtake[] {
    const progress = new Map<string, number>()
    for (const sample of samples) {
      if (sample.status !== 'racing') continue
      progress.set(sample.id, sample.progress)
    }

    const order = [...progress.keys()].sort((a, b) => {
      const gap = (progress.get(b) ?? 0) - (progress.get(a) ?? 0)
      return gap !== 0 ? gap : a.localeCompare(b)
    })

    // The very first sample, and any race where a marble joined or left the
    // active set (finish, DNF, recovery), only re-baselines the detector.
    if (this.confirmed === null || !sameMembers(this.confirmed, order)) {
      this.confirmed = order
      this.pending = null
      return []
    }

    if (sameOrder(this.confirmed, order)) {
      this.pending = null
      return []
    }

    const marginSwaps = changedPairs(this.confirmed, order).filter((pair) => {
      const a = progress.get(pair.overtakerId) ?? 0
      const b = progress.get(pair.overtakenId) ?? 0
      return Math.abs(a - b) >= this.minMargin
    })

    // A sub-margin wobble is jitter: it never starts a hold timer.
    if (marginSwaps.length === 0) {
      this.pending = null
      return []
    }

    if (!this.pending || !sameOrder(this.pending.ids, order)) {
      this.pending = { ids: order, since: nowMs }
      return []
    }

    if (nowMs - this.pending.since < this.holdMs) return []

    const swaps: Overtake[] = []
    for (const pair of changedPairs(this.confirmed, order)) {
      const a = progress.get(pair.overtakerId) ?? 0
      const b = progress.get(pair.overtakenId) ?? 0
      const margin = Math.abs(a - b)
      if (margin < this.minMargin) continue
      swaps.push({ ...pair, margin })
    }

    this.confirmed = order
    this.pending = null
    return swaps
  }
}

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Every pair whose relative order differs between the two rankings. */
function changedPairs(
  before: readonly string[],
  after: readonly string[],
): Omit<Overtake, 'margin'>[] {
  const pairs: Omit<Overtake, 'margin'>[] = []
  for (let i = 0; i < after.length; i += 1) {
    for (let j = i + 1; j < after.length; j += 1) {
      const ahead = after[i]
      const behind = after[j]
      const beforeAhead = before.indexOf(ahead)
      const beforeBehind = before.indexOf(behind)
      if (beforeAhead < 0 || beforeBehind < 0) continue
      if (beforeAhead > beforeBehind) {
        pairs.push({ overtakerId: ahead, overtakenId: behind })
      }
    }
  }
  return pairs
}
