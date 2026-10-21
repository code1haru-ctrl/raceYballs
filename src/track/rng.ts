/**
 * Deterministic, side-effect-free random number source for track generation.
 *
 * `mulberry32` is a small, fast, well-distributed 32-bit PRNG. The generator
 * only ever consumes numbers from a seeded `RandomSource`, so a given seed
 * always yields the exact same layout and no code path can reach for
 * `Math.random`, `Date` or `performance.now` to mutate a track.
 */

/** Largest seed value allowed (fits an unsigned 32-bit integer). */
export const MAX_SEED = 0xffffffff

export interface RandomSource {
  /** Uniform float in [0, 1). */
  next(): number
}

/**
 * Creates a mulberry32 generator for `seed`. The same seed always produces
 * the same sequence; different seeds produce different sequences.
 */
export function mulberry32(seed: number): RandomSource {
  let state = seed >>> 0
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/** Uniform float in [min, max). */
export function randomInRange(rng: RandomSource, min: number, max: number): number {
  return min + rng.next() * (max - min)
}

/** Uniform integer in [min, max] inclusive. */
export function randomIntInRange(
  rng: RandomSource,
  min: number,
  max: number,
): number {
  return min + Math.floor(rng.next() * (max - min + 1))
}

/** Picks one element of `items` uniformly (returns undefined when empty). */
export function pickFrom<T>(rng: RandomSource, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(rng.next() * items.length)]
}
