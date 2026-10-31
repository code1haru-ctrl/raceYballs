import { describe, expect, it } from 'vitest'
import { DEFAULT_MARBLES } from '../config'
import { startPositionsFor, START_POSITIONS } from './generate'

describe('start positions', () => {
  it('pins the default 10-marble grid to the Phase 3A layout', () => {
    const positions = startPositionsFor(DEFAULT_MARBLES)
    expect(positions).toHaveLength(START_POSITIONS.length)
    expect(positions).toEqual(START_POSITIONS)
  })
})
