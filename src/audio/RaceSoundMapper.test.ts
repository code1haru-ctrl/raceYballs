import { describe, expect, it } from 'vitest'
import { AUDIO_CONFIG } from './config'
import { RaceSoundMapper } from './RaceSoundMapper'
import type {
  PlaySoundOptions,
  SoundCategory,
  SoundPlayer,
} from './types'

class FakePlayer implements SoundPlayer {
  readonly plays: { category: SoundCategory; options?: PlaySoundOptions }[] = []
  silenced = 0

  play(category: SoundCategory, options?: PlaySoundOptions): boolean {
    this.plays.push({ category, options })
    return true
  }

  silence(): void {
    this.silenced += 1
  }
}

const ABOVE_THRESHOLD = AUDIO_CONFIG.collision.minImpact + 5

describe('the race sound mapper', () => {
  it('blocks a second collision inside the cooldown and allows it after', () => {
    const player = new FakePlayer()
    const mapper = new RaceSoundMapper(player)
    const event = { type: 'collision' as const, marbleId: 'a', otherId: null, kind: 'track' as const, impact: ABOVE_THRESHOLD }

    expect(mapper.handle(event, 0)).toBe(true)
    expect(mapper.handle(event, 119)).toBe(false)
    expect(mapper.handle(event, 120)).toBe(true)
    expect(player.plays).toHaveLength(2)
  })

  it('stays silent for a collision below the impact threshold', () => {
    const player = new FakePlayer()
    const mapper = new RaceSoundMapper(player)

    const played = mapper.handle(
      {
        type: 'collision',
        marbleId: 'a',
        otherId: 'b',
        kind: 'marble',
        impact: AUDIO_CONFIG.collision.minImpact - 0.01,
      },
      0,
    )

    expect(played).toBe(false)
    expect(player.plays).toHaveLength(0)
  })

  it('caps a collision pile-up with the global budget', () => {
    const player = new FakePlayer()
    const mapper = new RaceSoundMapper(player)
    const event = { type: 'collision' as const, marbleId: 'a', otherId: null, kind: 'track' as const, impact: ABOVE_THRESHOLD }

    let played = 0
    for (let i = 0; i < AUDIO_CONFIG.collisionBudget.max; i += 1) {
      if (mapper.handle(event, i * 130)) played += 1
    }
    expect(played).toBe(AUDIO_CONFIG.collisionBudget.max)

    expect(mapper.handle(event, AUDIO_CONFIG.collisionBudget.max * 130)).toBe(
      false,
    )
  })

  it('applies the overtake cooldown in real time', () => {
    const player = new FakePlayer()
    const mapper = new RaceSoundMapper(player)
    const event = {
      type: 'overtake' as const,
      overtakerId: 'b',
      overtakenId: 'a',
      margin: 2,
    }

    expect(mapper.handle(event, 0)).toBe(true)
    expect(mapper.handle(event, 399)).toBe(false)
    expect(mapper.handle(event, 400)).toBe(true)
  })

  it('uses the distinct first-finisher variant and applies the finish cooldown', () => {
    const player = new FakePlayer()
    const mapper = new RaceSoundMapper(player)

    expect(
      mapper.handle(
        { type: 'finish', place: 1, marbleId: 'a', timeSec: 4 },
        0,
      ),
    ).toBe(true)
    expect(player.plays[0]).toMatchObject({
      category: 'finish',
      options: { preferredVariant: 0 },
    })

    expect(
      mapper.handle(
        { type: 'finish', place: 2, marbleId: 'b', timeSec: 4.05 },
        100,
      ),
    ).toBe(false)

    expect(
      mapper.handle(
        { type: 'finish', place: 2, marbleId: 'b', timeSec: 4.2 },
        150,
      ),
    ).toBe(true)
    expect(player.plays[1].options?.preferredVariant).toBeUndefined()
  })

  it('clears sequencing and silences the player on reset', () => {
    const player = new FakePlayer()
    const mapper = new RaceSoundMapper(player)
    const event = { type: 'collision' as const, marbleId: 'a', otherId: null, kind: 'track' as const, impact: ABOVE_THRESHOLD }

    mapper.handle(event, 0)
    mapper.handle({ type: 'silence', reason: 'reset' }, 10)

    expect(player.silenced).toBe(1)
    // A fresh race starts with fresh cooldowns.
    expect(mapper.handle(event, 20)).toBe(true)
  })
})
