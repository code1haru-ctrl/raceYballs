/**
 * Every tunable audio value (Phase 5).
 *
 * Cooldowns and budgets are expressed in real (wall-clock) milliseconds. They
 * are deliberately independent of the simulation speed slider, so a 3x race
 * does not get a denser soundtrack.
 */

export const AUDIO_CONFIG = {
  /** Initial UI volume, 0..1. */
  defaultVolume: 0.5,
  defaultMuted: false,
  /** Ceiling of the master gain before the user volume is applied. */
  masterGain: 1,
  /** Smoothing time for volume and mute changes, in seconds. */
  rampSeconds: 0.05,
  /** Maximum sound events playing at the same time. */
  maxVoices: 8,
  /** Random pitch variation applied to every synthesized/file sound. */
  pitchJitter: 0.015,

  cooldownMs: {
    collision: 120,
    overtake: 400,
    finish: 150,
  },

  /** Sliding-window budget so a pile-up cannot flood the collision channel. */
  collisionBudget: {
    windowMs: 1000,
    max: 6,
  },

  collision: {
    /** Post-solve impulse below this is treated as resting contact. */
    minImpact: 2.2,
    /** Impulse at which a collision reaches its loudest/fastest variant. */
    fullImpact: 100,
    minGain: 0.35,
    maxGain: 1,
    minPitch: 0.94,
    maxPitch: 1.12,
  },

  overtake: {
    gain: 0.6,
    pitch: 1,
  },

  finish: {
    gain: 0.85,
    pitch: 1,
  },
}

export type AudioConfig = typeof AUDIO_CONFIG
