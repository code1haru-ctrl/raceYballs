/**
 * Bridge between the race event stream and the audio engine (Phase 5).
 *
 * This is the only audio class the React app touches. It owns the engine and
 * the mapper, subscribes to `RaceEventSource` (the RaceController), and makes
 * sure unmounting detaches the listener and closes the AudioContext.
 */

import { AudioEngine, type AudioEngineOptions } from './AudioEngine'
import { AUDIO_CONFIG, type AudioConfig } from './config'
import { RaceSoundMapper } from './RaceSoundMapper'
import type { RaceEventSource } from '../race/raceEvents'

export interface RaceAudioOptions extends AudioEngineOptions {
  config?: AudioConfig
  /** Injectable clock for tests; defaults to performance.now(). */
  now?: () => number
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export class RaceAudio {
  readonly engine: AudioEngine
  readonly mapper: RaceSoundMapper
  private readonly now: () => number
  private unsubscribe: (() => void) | null = null

  constructor(options: RaceAudioOptions = {}) {
    const config = options.config ?? AUDIO_CONFIG
    this.engine = new AudioEngine({ ...options, config })
    this.mapper = new RaceSoundMapper(this.engine, config)
    this.now = options.now ?? defaultNow
  }

  /** Subscribes to a race event source; returns the detach function. */
  attach(source: RaceEventSource): () => void {
    this.detach()
    const unsubscribe = source.subscribeRaceEvents((event) => {
      this.mapper.handle(event, this.now())
    })
    this.unsubscribe = unsubscribe
    return () => {
      if (this.unsubscribe === unsubscribe) this.detach()
    }
  }

  detach(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Must be called from a user gesture to satisfy autoplay policies. */
  async unlock(): Promise<void> {
    await this.engine.unlock()
  }

  setVolume(value: number): void {
    this.engine.setVolume(value)
  }

  setMuted(muted: boolean): void {
    this.engine.setMuted(muted)
  }

  getVolume(): number {
    return this.engine.getVolume()
  }

  isMuted(): boolean {
    return this.engine.isMuted()
  }

  dispose(): void {
    this.detach()
    this.mapper.reset()
    this.engine.dispose()
  }
}
