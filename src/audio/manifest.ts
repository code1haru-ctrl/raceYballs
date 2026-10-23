/**
 * Optional real audio files per category (Phase 5).
 *
 * The bank starts with an empty manifest: the game ships only synthesized
 * placeholders. To add real files later, drop them into `public/audio/` and
 * list their public paths here, e.g. `'audio/collision-01.mp3'`.
 *
 * A listed file is fetched and decoded when the AudioContext is first unlocked.
 * If it is missing or cannot be decoded, that category silently keeps using the
 * synthesized variants.
 */

import type { SoundCategory } from './types'

export type SoundManifest = Record<SoundCategory, readonly string[]>

export const SOUND_MANIFEST: SoundManifest = {
  collision: [],
  overtake: [],
  finish: [],
}

/** Builds a public URL that also works under a GitHub Pages subpath. */
export function soundFileUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.replace(/^\/+/, '')
  return `${normalizedBase}${normalizedPath}`
}
