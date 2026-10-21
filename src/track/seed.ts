/**
 * The single sanctioned source of new seed values.
 *
 * Track generation is fully deterministic and never consults the clock or
 * `Math.random`. Only the "New Variation" control — a deliberate user action —
 * is allowed to draw a fresh seed, and it goes through this module so the rule
 * is easy to audit.
 */

import { MAX_SEED } from './rng'

/** Returns a fresh, unsigned 32-bit seed for the "New Variation" control. */
export function pickFreshSeed(): number {
  return Math.floor(Math.random() * (MAX_SEED + 1)) >>> 0
}

/** Normalises any incoming seed to a valid unsigned 32-bit integer. */
export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0
  return Math.floor(Math.abs(seed)) >>> 0
}
