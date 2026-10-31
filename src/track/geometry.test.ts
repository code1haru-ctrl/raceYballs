import { describe, expect, it } from 'vitest'
import { PROTOTYPE_TRACK } from './track'

describe('geometry types', () => {
  it('defines the new obstacle arrays in the track data', () => {
    expect(PROTOTYPE_TRACK.obstacles.diamonds).toBeDefined()
    expect(PROTOTYPE_TRACK.obstacles.rings).toBeDefined()
    expect(PROTOTYPE_TRACK.obstacles.concaveWalls).toBeDefined()
    expect(Array.isArray(PROTOTYPE_TRACK.obstacles.diamonds)).toBe(true)
    expect(Array.isArray(PROTOTYPE_TRACK.obstacles.rings)).toBe(true)
    expect(Array.isArray(PROTOTYPE_TRACK.obstacles.concaveWalls)).toBe(true)
  })
})
