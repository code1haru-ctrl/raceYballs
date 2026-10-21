/**
 * Single source of truth for simulation constants.
 *
 * Every value the physics engine is tuned by lives here — timestep, gravity,
 * marble size and surface properties, solver iterations and the temporary
 * safety limit. Nothing in the engine, track, renderer or tests may define a
 * second copy of these numbers.
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
 * TEMPORARY safety limit, in simulated seconds. Any marble still racing when
 * the limit is reached is reported as "unfinished" — never as finished and
 * never as DNF; no position is invented for it.
 *
 * Phase 3 will replace this limit with stuck-marble recovery, after which the
 * limit itself can be removed.
 */
export const TEMP_SAFETY_LIMIT_S = 75
