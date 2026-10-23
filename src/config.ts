/**
 * Single source of truth for simulation constants.
 *
 * Every value the physics engine is tuned by lives here — timestep, gravity,
 * marble size and surface properties, solver iterations, and the Phase 3B
 * stuck-detection / recovery / DNF rules. Nothing in the engine, track,
 * renderer or tests may define a second copy of these numbers.
 */

/** Fixed physics timestep (simulation seconds per physics step). */
export const FIXED_TIME_STEP = 1 / 60

/** Downward gravity in physics units per second squared. */
export const GRAVITY_Y = -16

/** Marble radius in physics units. */
export const MARBLE_RADIUS = 1.1
/** Marble diameter D in physics units (2 x radius). */
export const MARBLE_DIAMETER = MARBLE_RADIUS * 2

/** Mass properties of a marble. */
export const MARBLE_DENSITY = 1
/** How bouncy a marble is against track geometry. */
export const MARBLE_RESTITUTION = 0.25
/** How much a marble drags against track geometry. */
export const MARBLE_FRICTION = 0.28

/** Surface properties of the track itself. */
export const TRACK_FRICTION = 0.35
export const TRACK_RESTITUTION = 0.05
/** Restitution for deflector bars and pegs (firmer than the walls). */
export const BAR_RESTITUTION = 0.1

/** Planck.js solver iteration counts for a fixed step. */
export const VELOCITY_ITERATIONS = 8
export const POSITION_ITERATIONS = 3

/**
 * Phase 3B — stuck detection, recovery and DNF.
 *
 * A marble is "stuck" when it fails to make forward progress along the
 * centerline inside `STUCK_WINDOW_S`. Stuck marbles get a bounded number of
 * recovery attempts (each one puts them back on a clear piece of the racing
 * line that is never ahead of the progress they had already reached). When
 * the attempts run out — or when the race hits `HARD_RACE_LIMIT_S` — the
 * marble is a DNF. No finishing position is ever invented for a DNF.
 */

/** Length of the window used to measure a marble's forward progress. */
export const STUCK_WINDOW_S = 3
/** Minimum forward progress inside that window, in marble diameters. */
export const MIN_PROGRESS_D = 0.5
/** How often progress is sampled and the stuck window is evaluated. */
export const CHECK_INTERVAL_S = 0.5
/** Cooldown before the same marble may be recovered again. */
export const RECOVERY_COOLDOWN_S = 2
/** Maximum recovery attempts per marble before it becomes a DNF. */
export const MAX_RECOVERY_ATTEMPTS = 3
/** Grace period after the start before stuck detection is armed. */
export const GRACE_AFTER_START_S = 3
/** Minimum clearance a recovery spot needs from the track geometry, in D. */
export const RECOVERY_CLEARANCE_D = 1.5
/** Spacing between candidate recovery spots searched along the centerline. */
export const RECOVERY_SAMPLE_STEP = 0.5
/** Hard race timeout in simulated seconds; still-racing marbles are DNF. */
export const HARD_RACE_LIMIT_S = 120

/**
 * Phase 5 — collision reporting.
 *
 * A contact only becomes a race event when the pre-solve approach speed is at
 * least this value, which keeps resting/stacked contacts silent. Teleports are
 * followed by a short suppression window so recovery never produces a hit.
 */
export const COLLISION_MIN_APPROACH_SPEED = 0.8
export const COLLISION_SILENCE_AFTER_TELEPORT_S = 0.35

/**
 * Overtake detection. The margin is a centerline distance, the hold time is
 * real time so a faster simulation never produces more overtake sounds.
 */
export const OVERTAKE_MIN_PROGRESS_MARGIN = MARBLE_DIAMETER * 0.75
export const OVERTAKE_HOLD_MS = 220
