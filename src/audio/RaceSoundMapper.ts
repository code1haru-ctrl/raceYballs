/**
 * Event-to-sound mapper (Phase 5).
 *
 * Turns plain race events into calls on the audio engine. All filtering lives
 * here: collision impact threshold, per-category real-time cooldowns, the
 * collision budget and the finish-order preference. It never reads simulation
 * speed or the simulation clock.
 */

import { AUDIO_CONFIG, type AudioConfig } from './config'
import type { RaceEvent } from '../race/raceEvents'
import type {
  PlaySoundOptions,
  SoundCategory,
  SoundPlayer,
} from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export class RaceSoundMapper {
  private readonly player: SoundPlayer
  private readonly config: AudioConfig
  private readonly lastPlayed: Record<SoundCategory, number> = {
    collision: Number.NEGATIVE_INFINITY,
    overtake: Number.NEGATIVE_INFINITY,
    finish: Number.NEGATIVE_INFINITY,
  }
  private collisionTimes: number[] = []

  constructor(player: SoundPlayer, config: AudioConfig = AUDIO_CONFIG) {
    this.player = player
    this.config = config
  }

  /**
   * Applies the event rules and asks the player for a sound. Returns true when
   * a sound was actually requested. `nowMs` is real time in milliseconds.
   */
  handle(event: RaceEvent, nowMs: number): boolean {
    switch (event.type) {
      case 'collision':
        return this.handleCollision(event.impact, nowMs)
      case 'overtake':
        return this.playWithCooldown('overtake', nowMs, {
          gain: this.config.overtake.gain,
          pitch: this.config.overtake.pitch,
        })
      case 'finish':
        return this.playWithCooldown('finish', nowMs, {
          gain: this.config.finish.gain,
          pitch: this.config.finish.pitch,
          preferredVariant: event.place === 1 ? 0 : undefined,
        })
      case 'silence':
        this.reset()
        this.player.silence()
        return false
    }
  }

  /** Clears cooldowns and the collision budget without touching the player. */
  reset(): void {
    this.lastPlayed.collision = Number.NEGATIVE_INFINITY
    this.lastPlayed.overtake = Number.NEGATIVE_INFINITY
    this.lastPlayed.finish = Number.NEGATIVE_INFINITY
    this.collisionTimes = []
  }

  private handleCollision(impact: number, nowMs: number): boolean {
    const settings = this.config.collision
    if (impact < settings.minImpact) return false
    if (!this.cooldownElapsed('collision', nowMs)) return false
    if (!this.collisionBudgetAllows(nowMs)) return false

    const strength = clamp(
      (impact - settings.minImpact) /
        Math.max(settings.fullImpact - settings.minImpact, 0.001),
      0,
      1,
    )
    this.lastPlayed.collision = nowMs
    this.collisionTimes.push(nowMs)

    return this.player.play('collision', {
      gain:
        settings.minGain + (settings.maxGain - settings.minGain) * strength,
      pitch:
        settings.minPitch + (settings.maxPitch - settings.minPitch) * strength,
    })
  }

  private playWithCooldown(
    category: SoundCategory,
    nowMs: number,
    options: PlaySoundOptions,
  ): boolean {
    if (!this.cooldownElapsed(category, nowMs)) return false
    this.lastPlayed[category] = nowMs
    return this.player.play(category, options)
  }

  private cooldownElapsed(
    category: SoundCategory,
    nowMs: number,
  ): boolean {
    return (
      nowMs - this.lastPlayed[category] >= this.config.cooldownMs[category]
    )
  }

  private collisionBudgetAllows(nowMs: number): boolean {
    const budget = this.config.collisionBudget
    const cutoff = nowMs - budget.windowMs
    this.collisionTimes = this.collisionTimes.filter((time) => time > cutoff)
    return this.collisionTimes.length < budget.max
  }
}
