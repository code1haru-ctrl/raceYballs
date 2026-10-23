import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioScheduledSourceLike,
} from './webAudio'

/** The three sound families the race can emit. */
export type SoundCategory = 'collision' | 'overtake' | 'finish'

export interface SynthRenderOptions {
  /** Context time at which the variant should begin. */
  startAt: number
  /** Frequency multiplier (>= 0.25). */
  pitch: number
}

/**
 * One synthesized placeholder sound. Adding a variant is a matter of adding a
 * descriptor to the category list in `synth.ts`.
 */
export interface SynthVariant {
  id: string
  category: SoundCategory
  /** Total audible length in seconds. */
  duration: number
  render(
    context: AudioContextLike,
    destination: AudioNodeLike,
    options: SynthRenderOptions,
  ): AudioScheduledSourceLike[]
}

export type SoundSelection =
  | { kind: 'synth'; variant: SynthVariant; index: number }
  | { kind: 'file'; buffer: AudioBufferLike; index: number }

export interface PlaySoundOptions {
  /** Linear level of this sound event, 0..1. */
  gain?: number
  /** Frequency multiplier before the engine's own pitch jitter. */
  pitch?: number
  /** Forces a specific variant index when available (first finisher). */
  preferredVariant?: number
}

/** The player surface the event-to-sound mapper needs. */
export interface SoundPlayer {
  play(category: SoundCategory, options?: PlaySoundOptions): boolean
  silence(): void
}
