/**
 * Web Audio engine (Phase 5).
 *
 * Owns the AudioContext, the master gain and the voice limit. It knows nothing
 * about the race, React or the simulation: the event-to-sound mapper calls
 * `play()` with a plain category and level.
 *
 * The AudioContext is created lazily in `unlock()`, which the UI calls from a
 * user gesture (Start Race, mute or volume). Before that every call is a silent
 * no-op, so autoplay policies never produce an error.
 */

import { AUDIO_CONFIG, type AudioConfig } from './config'
import { createAudioRandom, type AudioRandom } from './rng'
import { SoundBank } from './soundBank'
import type {
  PlaySoundOptions,
  SoundCategory,
  SoundPlayer,
} from './types'
import {
  createBrowserAudioContext,
  type AudioContextLike,
  type AudioScheduledSourceLike,
  type GainNodeLike,
} from './webAudio'

interface ActiveVoice {
  gain: GainNodeLike
  sources: AudioScheduledSourceLike[]
  endsAt: number
}

export interface AudioEngineOptions {
  config?: AudioConfig
  soundBank?: SoundBank
  rng?: AudioRandom
  /** Injected in tests; defaults to the browser AudioContext constructor. */
  contextFactory?: () => AudioContextLike | null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export class AudioEngine implements SoundPlayer {
  private readonly config: AudioConfig
  private readonly soundBank: SoundBank
  private readonly rng: AudioRandom
  private readonly contextFactory: () => AudioContextLike | null
  private context: AudioContextLike | null = null
  private master: GainNodeLike | null = null
  private voices: ActiveVoice[] = []
  private volume = AUDIO_CONFIG.defaultVolume
  private muted = AUDIO_CONFIG.defaultMuted
  private appliedGain = 0

  constructor(options: AudioEngineOptions = {}) {
    this.config = options.config ?? AUDIO_CONFIG
    this.soundBank = options.soundBank ?? new SoundBank()
    this.rng = options.rng ?? createAudioRandom()
    this.contextFactory =
      options.contextFactory ?? createBrowserAudioContext
    this.volume = this.config.defaultVolume
    this.muted = this.config.defaultMuted
  }

  /** Creates or resumes the AudioContext. Safe to call on every gesture. */
  async unlock(): Promise<void> {
    if (!this.context) {
      const context = this.contextFactory()
      if (!context) return

      this.context = context
      const master = context.createGain()
      master.connect(context.destination)
      this.master = master
      this.appliedGain = this.muted
        ? 0
        : this.volume * this.config.masterGain
      master.gain.setValueAtTime(this.appliedGain, context.currentTime)

      try {
        await this.soundBank.load(context)
      } catch {
        // A missing file must never break the race or spam the console.
      }
    }

    try {
      if (this.context.state !== 'running') await this.context.resume()
    } catch {
      // Autoplay can still refuse until another gesture; stay silent.
    }
  }

  setVolume(value: number): void {
    this.volume = clamp(value, 0, 1)
    if (!this.muted) this.rampMaster(this.volume * this.config.masterGain)
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.rampMaster(muted ? 0 : this.volume * this.config.masterGain)
  }

  isMuted(): boolean {
    return this.muted
  }

  getVolume(): number {
    return this.volume
  }

  /** Number of voices that have not finished yet; mostly useful in tests. */
  getActiveVoiceCount(): number {
    this.purgeVoices()
    return this.voices.length
  }

  play(category: SoundCategory, options: PlaySoundOptions = {}): boolean {
    const context = this.context
    const master = this.master
    if (!context || !master || this.muted) return false

    this.purgeVoices()
    if (this.voices.length >= this.config.maxVoices) return false

    const selection = this.soundBank.select(
      category,
      this.rng,
      options.preferredVariant,
    )
    const startAt = context.currentTime
    const level = clamp(options.gain ?? 1, 0, 1)
    const basePitch = clamp(options.pitch ?? 1, 0.25, 4)
    const jitter =
      1 + (this.rng.next() * 2 - 1) * this.config.pitchJitter
    const pitch = clamp(basePitch * jitter, 0.25, 4)

    const voiceGain = context.createGain()
    voiceGain.connect(master)

    let sources: AudioScheduledSourceLike[] = []
    let duration: number

    if (selection.kind === 'file') {
      const source = context.createBufferSource()
      source.buffer = selection.buffer
      source.playbackRate.setValueAtTime(pitch, startAt)
      source.connect(voiceGain)
      duration = selection.buffer.duration / pitch

      // Short fades keep the file's edges click-free.
      voiceGain.gain.setValueAtTime(0.0001, startAt)
      voiceGain.gain.linearRampToValueAtTime(level, startAt + 0.006)
      voiceGain.gain.setValueAtTime(
        level,
        Math.max(startAt + 0.006, startAt + duration - 0.025),
      )
      voiceGain.gain.linearRampToValueAtTime(0.0001, startAt + duration)

      source.start(startAt)
      source.stop(startAt + duration + 0.01)
      sources = [source]
    } else {
      voiceGain.gain.setValueAtTime(level, startAt)
      duration = selection.variant.duration
      sources = selection.variant.render(context, voiceGain, {
        startAt,
        pitch,
      })
    }

    this.voices.push({
      gain: voiceGain,
      sources,
      endsAt: startAt + duration + 0.02,
    })
    return true
  }

  /** Immediately fades and stops every voice (Reset / Race Again / track). */
  silence(): void {
    const context = this.context
    const stopAt = context ? context.currentTime + 0.02 : 0

    for (const voice of this.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(
          context ? context.currentTime : 0,
        )
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, context ? context.currentTime : 0)
        voice.gain.gain.linearRampToValueAtTime(0.0001, stopAt)
      } catch {
        // A stopped/finished node may reject scheduling; nothing to do.
      }
      for (const source of voice.sources) {
        try {
          source.stop(stopAt)
        } catch {
          // Already stopped.
        }
      }
    }

    this.voices = []
  }

  /** Stops every voice and closes the AudioContext. Reusable after unlock. */
  dispose(): void {
    this.silence()
    if (this.context) {
      try {
        void this.context.close()
      } catch {
        // Context may already be closed.
      }
    }
    this.context = null
    this.master = null
    this.appliedGain = 0
    this.soundBank.clear()
  }

  private rampMaster(target: number): void {
    const context = this.context
    const master = this.master
    if (!context || !master) {
      this.appliedGain = target
      return
    }

    const now = context.currentTime
    const current = this.appliedGain
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(current, now)
    master.gain.linearRampToValueAtTime(
      target,
      now + this.config.rampSeconds,
    )
    this.appliedGain = target
  }

  private purgeVoices(): void {
    if (!this.context) {
      this.voices = []
      return
    }
    const now = this.context.currentTime
    this.voices = this.voices.filter((voice) => voice.endsAt > now)
  }
}
