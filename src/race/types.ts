import type { TrackId } from '../data'
import type { DnfReason } from '../physics/MarbleRaceSimulation'
import type { MarbleConfig } from './marbleCustomization'

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
  /** Finishing position; null for every marble that did not finish. */
  place: number | null
  /** Finish time in simulated seconds; null for every marble that did not finish. */
  timeSec: number | null
  /** Why the marble retired; only set for DNF marbles. */
  dnfReason: DnfReason | null
  /** How many recovery attempts the marble had used when it retired. */
  recoveryAttempts: number
}

/**
 * The name and color a marble had during one race.
 *
 * A snapshot is frozen when the race is recorded: editing a marble later
 * never rewrites the history.
 */
export interface MarbleSnapshot {
  id: string
  name: string
  color: string
}

/** A marble that never finished, with the reason and the attempts used. */
export interface HistoryDnf {
  marbleId: string
  reason: DnfReason
  /** How many recovery attempts the marble had used when it retired. */
  attempts: number
}

/**
 * One completed race in the history.
 *
 * The finishing order and the DNF list are keyed by marble id, never by name:
 * a marble can be renamed at any time and the recorded race stays the same.
 */
export interface RaceHistoryEntry {
  /** Unique id of this entry; also the duplicate guard. */
  id: string
  trackId: TrackId
  trackName: string
  seed: number
  /** How many marbles took part in this race. */
  marbleCount: number
  /** Finishing order of the marbles that crossed the line. */
  results: FinishRecord[]
  /** The marbles that never finished. */
  dnfList: HistoryDnf[]
  /** Simulated duration of the race, in simulated seconds. */
  duration: number
  /** The marble names and colors as they were during this race. */
  marbleSnapshots: MarbleSnapshot[]
}

/** The outcome of a marble edit requested by the UI. */
export interface MarbleEditResult {
  /** True when the edit was applied. */
  ok: boolean
  /** Why the edit was rejected; unset when it was applied. */
  error?: string
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
  /** Display name of the currently loaded track. */
  trackName: string
  seed: number
  /** Number of active marbles in the staged or current race. */
  marbleCount: number
  results: FinishRecord[]
  standings: MarbleStanding[]
  /** The names and colors of the active marbles only. */
  marbles: MarbleConfig[]
  /** The last completed races, newest first. */
  history: RaceHistoryEntry[]
}
