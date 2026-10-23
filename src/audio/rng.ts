/**
 * Audio-only random source.
 *
 * This is intentionally separate from the seeded track generator: audio is
 * allowed to vary between runs, and nothing here can ever consume or advance
 * the track RNG. Tests inject their own source for determinism.
 */

export interface AudioRandom {
  /** Uniform float in [0, 1). */
  next(): number
}

/** Small mulberry32 implementation owned by the audio layer. */
export function createAudioRandom(seed?: number): AudioRandom {
  let state =
    typeof seed === 'number'
      ? seed >>> 0
      : (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0

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

export function randomBetween(
  rng: AudioRandom,
  min: number,
  max: number,
): number {
  return min + rng.next() * (max - min)
}
