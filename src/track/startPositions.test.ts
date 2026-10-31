import { describe, expect, it } from 'vitest'
import { DEFAULT_MARBLES, MARBLE_DIAMETER, MAX_MARBLES, MIN_MARBLES } from '../config'
import { pointRectDistance } from './geometry'
import {
  buildTrack,
  startPositionsFor,
  START_LINE_Y_MAP,
  START_MIN_OBSTACLE_D,
  START_MIN_PAIR_D,
  START_MIN_WALL_D,
  START_POSITIONS,
} from './generate'

describe('start positions', () => {
  it('pins the default 10-marble grid to the Phase 3A layout', () => {
    const positions = startPositionsFor(DEFAULT_MARBLES)
    expect(positions).toHaveLength(START_POSITIONS.length)
    expect(positions).toEqual(START_POSITIONS)
  })
})

describe('Wyrmwood start grid', () => {
  it('stacks alternating rows of five and four upward for counts 2..20', () => {
    for (let count = MIN_MARBLES; count <= MAX_MARBLES; count += 1) {
      const positions = startPositionsFor(count, 'wyrmwood')
      expect(positions).toHaveLength(count)

      const rows = new Map<number, number>()
      for (const slot of positions) {
        rows.set(slot.y, (rows.get(slot.y) ?? 0) + 1)
      }
      const orderedRows = [...rows.entries()].sort(([a], [b]) => a - b)

      const expected: number[] = []
      let remaining = count
      while (remaining > 0) {
        const capacity = expected.length % 2 === 0 ? 5 : 4
        const take = Math.min(capacity, remaining)
        expected.push(take)
        remaining -= take
      }
      expect(orderedRows.map(([, rowCount]) => rowCount)).toEqual(expected)

      for (let row = 1; row < orderedRows.length; row += 1) {
        expect(orderedRows[row][0]).toBeGreaterThan(orderedRows[row - 1][0])
      }
      expect(orderedRows[0][0]).toBeGreaterThanOrEqual(START_LINE_Y_MAP.wyrmwood)
    }
  })

  it('keeps the 1.0D wall, 1.3D pair and 1.5D obstacle clearances', () => {
    const minWall = START_MIN_WALL_D * MARBLE_DIAMETER
    const minPair = START_MIN_PAIR_D * MARBLE_DIAMETER
    const minObstacle = START_MIN_OBSTACLE_D * MARBLE_DIAMETER
    const epsilon = 1e-9

    for (let count = MIN_MARBLES; count <= MAX_MARBLES; count += 1) {
      const track = buildTrack('wyrmwood', 1, count)
      const slots = track.startPositions

      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i]
        expect(slot.x - track.startZone.minX).toBeGreaterThanOrEqual(
          minWall - epsilon,
        )
        expect(track.startZone.maxX - slot.x).toBeGreaterThanOrEqual(
          minWall - epsilon,
        )
        expect(track.height - slot.y).toBeGreaterThanOrEqual(minWall - epsilon)
        expect(slot.y).toBeGreaterThanOrEqual(START_LINE_Y_MAP.wyrmwood)
        expect(slot.y).toBeLessThanOrEqual(track.startZone.maxY)

        for (const bar of track.obstacles.bars) {
          expect(pointRectDistance(slot.x, slot.y, bar)).toBeGreaterThanOrEqual(
            minObstacle - epsilon,
          )
        }
        for (const peg of track.obstacles.pegs) {
          expect(
            Math.hypot(slot.x - peg.cx, slot.y - peg.cy) - peg.radius,
          ).toBeGreaterThanOrEqual(minObstacle - epsilon)
        }

        for (let j = i + 1; j < slots.length; j += 1) {
          expect(
            Math.hypot(slot.x - slots[j].x, slot.y - slots[j].y),
          ).toBeGreaterThanOrEqual(minPair - epsilon)
        }
      }
    }
  })
})
