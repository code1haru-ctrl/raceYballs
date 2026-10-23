import { describe, expect, it } from 'vitest'
import { SOUND_MANIFEST, soundFileUrl, type SoundManifest } from './manifest'
import { FakeAudioContext, fixedRandom } from './testing/fakeAudio'
import { SoundBank } from './soundBank'
import type { SoundCategory } from './types'
import { SYNTH_VARIANTS } from './synth'

const CATEGORIES: SoundCategory[] = ['collision', 'overtake', 'finish']

describe('the sound bank', () => {
  it('ships an empty file manifest', () => {
    expect(SOUND_MANIFEST.collision).toEqual([])
    expect(SOUND_MANIFEST.overtake).toEqual([])
    expect(SOUND_MANIFEST.finish).toEqual([])
  })

  it('has at least four collision and three of each other synth variant', () => {
    expect(SYNTH_VARIANTS.collision.length).toBeGreaterThanOrEqual(4)
    expect(SYNTH_VARIANTS.overtake.length).toBeGreaterThanOrEqual(3)
    expect(SYNTH_VARIANTS.finish.length).toBeGreaterThanOrEqual(3)
  })

  it('selects a variant within the requested category using the audio RNG', () => {
    const bank = new SoundBank()

    for (const category of CATEGORIES) {
      let calls = 0
      const rng = {
        next() {
          calls += 1
          return 0.999999
        },
      }

      const selection = bank.select(category, rng)
      expect(calls).toBe(1)
      expect(selection.kind).toBe('synth')
      if (selection.kind === 'synth') {
        expect(selection.variant.category).toBe(category)
        expect(selection.variant.id.startsWith(category)).toBe(true)
        expect(selection.index).toBe(SYNTH_VARIANTS[category].length - 1)
      }
    }
  })

  it('honours a preferred variant for the first finisher', () => {
    const bank = new SoundBank()
    const selection = bank.select('finish', fixedRandom(0.99), 0)

    expect(selection.kind).toBe('synth')
    if (selection.kind === 'synth') {
      expect(selection.index).toBe(0)
      expect(selection.variant.id).toBe('finish-01')
    }
  })

  it('falls back to synthesized sounds when a listed file is missing', async () => {
    const manifest: SoundManifest = {
      collision: ['audio/collision-01.mp3'],
      overtake: ['audio/overtake-01.mp3'],
      finish: ['audio/finish-01.mp3'],
    }
    const bank = new SoundBank({
      manifest,
      fetcher: async () => {
        throw new Error('404')
      },
    })

    await expect(bank.load(new FakeAudioContext())).resolves.toBeUndefined()

    for (const category of CATEGORIES) {
      expect(bank.hasFiles(category)).toBe(false)
      expect(bank.select(category, fixedRandom(0)).kind).toBe('synth')
    }
  })

  it('keeps the synthesized variants when only some files decode', async () => {
    const manifest: SoundManifest = {
      collision: ['audio/collision-01.mp3', 'audio/collision-02.mp3'],
      overtake: [],
      finish: [],
    }
    const bank = new SoundBank({
      manifest,
      fetcher: async (url) => {
        if (url.endsWith('collision-02.mp3')) throw new Error('404')
        return new ArrayBuffer(8)
      },
    })

    await bank.load(new FakeAudioContext())

    expect(bank.hasFiles('collision')).toBe(false)
    expect(bank.select('collision', fixedRandom(0)).kind).toBe('synth')
  })

  it('uses decoded files when they are available', async () => {
    const manifest: SoundManifest = {
      collision: ['audio/collision-01.mp3'],
      overtake: [],
      finish: [],
    }
    const bank = new SoundBank({
      manifest,
      fetcher: async () => new ArrayBuffer(8),
    })

    await bank.load(new FakeAudioContext())

    expect(bank.hasFiles('collision')).toBe(true)
    expect(bank.select('collision', fixedRandom(0)).kind).toBe('file')
    expect(bank.select('overtake', fixedRandom(0)).kind).toBe('synth')
  })

  it('builds manifest URLs from the public base URL', () => {
    expect(soundFileUrl('audio/collision-01.mp3')).toMatch(
      /^\/.*audio\/collision-01\.mp3$/,
    )
  })
})
