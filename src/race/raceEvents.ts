/**
 * Plain race events (Phase 5).
 *
 * These are deliberately free of any audio, rendering or React types. The
 * simulation and the controller only ever publish this small vocabulary; the
 * audio layer subscribes to it. Nothing in the physics or race code imports the
 * audio modules, so sound can never change the simulation.
 */

export interface CollisionRaceEvent {
  type: 'collision'
  /** The racing marble involved in the contact. */
  marbleId: string
  /** The other marble, or null when the contact was with track geometry. */
  otherId: string | null
  kind: 'marble' | 'track'
  /** Sum of the post-solve normal impulses (Planck units). */
  impact: number
}

export interface OvertakeRaceEvent {
  type: 'overtake'
  overtakerId: string
  overtakenId: string
  /** Progress gap along the centerline when the swap was confirmed. */
  margin: number
}

export interface FinishRaceEvent {
  type: 'finish'
  place: number
  marbleId: string
  timeSec: number
}

export type SilenceReason = 'reset' | 'race-again' | 'track-change'

/** Silence every pending sound; used by reset, Race Again and track changes. */
export interface SilenceRaceEvent {
  type: 'silence'
  reason: SilenceReason
}

export type RaceEvent =
  | CollisionRaceEvent
  | OvertakeRaceEvent
  | FinishRaceEvent
  | SilenceRaceEvent

export type RaceEventListener = (event: RaceEvent) => void

/** Anything that can publish race events (the RaceController in practice). */
export interface RaceEventSource {
  subscribeRaceEvents(listener: RaceEventListener): () => void
}
