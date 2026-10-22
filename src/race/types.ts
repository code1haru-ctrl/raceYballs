import type { TrackId } from '../data'

export type RaceState = 'Ready' | 'Running' | 'Completed'

/**
 * `racing` is on the track, `finished` crossed the line, `dnf` is out of the
 * race without a finishing position (recovery failed, or the race timed out).
 */
export type MarbleStatus = 'racing' | 'finished' | 'dnf'

export interface FinishRecord {
  place: number
  marbleId: string
  timeSec: number
}

export interface MarbleStanding {
  id: string
  name: string
  color: string
  status: MarbleStatus
  place: number | null
  timeSec: number | null
}

/**
 * UI-facing snapshot of the race. It is rebuilt only when meaningful state
 * changes (start, reset, finish, completion, speed, track change, whole
 * elapsed seconds), never on every animation frame.
 */
export interface RaceSnapshot {
  state: RaceState
  speed: number
  elapsedSec: number
  finishedCount: number
  /** Marbles that are out of the race without a finishing position. */
  dnfCount: number
  /** Currently loaded track and the seed its layout was generated from. */
  trackId: TrackId
  seed: number
  results: FinishRecord[]
  standings: MarbleStanding[]
}
