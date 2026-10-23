/**
 * File-ready sound bank (Phase 5).
 *
 * At startup the bank tries every file listed in the manifest. A missing file,
 * a failed fetch or a decode error is swallowed: that category simply keeps its
 * synthesized variants. The shipped manifest is empty, so the game needs no
 * audio assets to sound complete.
 */

import { soundFileUrl, SOUND_MANIFEST, type SoundManifest } from './manifest'
import type { AudioRandom } from './rng'
import { SYNTH_VARIANTS } from './synth'
import type { SoundCategory, SoundSelection } from './types'
import type { AudioBufferLike, AudioContextLike } from './webAudio'

export type SoundFetcher = (url: string) => Promise<ArrayBuffer>

async function defaultFetcher(url: string): Promise<ArrayBuffer> {
  if (typeof fetch !== 'function') throw new Error('fetch unavailable')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`audio file unavailable: ${url}`)
  return response.arrayBuffer()
}

export interface SoundBankOptions {
  manifest?: SoundManifest
  fetcher?: SoundFetcher
}

export class SoundBank {
  private readonly manifest: SoundManifest
  private readonly fetcher: SoundFetcher
  private readonly files: Partial<Record<SoundCategory, AudioBufferLike[]>> = {}

  constructor(options: SoundBankOptions = {}) {
    this.manifest = options.manifest ?? SOUND_MANIFEST
    this.fetcher = options.fetcher ?? defaultFetcher
  }

  /**
   * Fetches and decodes every listed file. Never throws and never logs.
   * A category only uses files when at least one of its files decoded.
   */
  async load(context: AudioContextLike): Promise<void> {
    const categories: SoundCategory[] = ['collision', 'overtake', 'finish']

    await Promise.all(
      categories.map(async (category) => {
        const paths = this.manifest[category] ?? []
        if (paths.length === 0) return

        const decoded = await Promise.all(
          paths.map(async (path) => {
            try {
              const data = await this.fetcher(soundFileUrl(path))
              return await context.decodeAudioData(data)
            } catch {
              return null
            }
          }),
        )

        // All-or-nothing per category: one missing file means the category
        // keeps its synthesized variants, as promised by the manifest rules.
        if (decoded.every((buffer) => buffer !== null)) {
          this.files[category] = decoded as AudioBufferLike[]
        }
      }),
    )
  }

  /** Drops decoded files; used when the AudioContext is disposed. */
  clear(): void {
    for (const category of ['collision', 'overtake', 'finish'] as const) {
      delete this.files[category]
    }
  }

  /** True when at least one real file decoded for this category. */
  hasFiles(category: SoundCategory): boolean {
    return (this.files[category]?.length ?? 0) > 0
  }

  /**
   * Picks a file if the category has one, otherwise a synthesized variant.
   * `preferredVariant` is used for the first finisher's distinct sound.
   */
  select(
    category: SoundCategory,
    rng: AudioRandom,
    preferredVariant?: number,
  ): SoundSelection {
    const files = this.files[category]
    if (files && files.length > 0) {
      const index = pickIndex(rng, files.length, preferredVariant)
      return { kind: 'file', buffer: files[index], index }
    }

    const variants = SYNTH_VARIANTS[category]
    const index = pickIndex(rng, variants.length, preferredVariant)
    return { kind: 'synth', variant: variants[index], index }
  }
}

function pickIndex(
  rng: AudioRandom,
  length: number,
  preferred?: number,
): number {
  if (preferred !== undefined && preferred >= 0 && preferred < length) {
    return preferred
  }
  return Math.min(length - 1, Math.floor(rng.next() * length))
}
