import { describe, expect, it } from 'vitest'
import { DEFAULT_MARBLES, MARBLE_DIAMETER, MARBLE_RADIUS } from '../config'
import { MARBLES } from '../data'
import { MarbleRaceSimulation } from '../physics/MarbleRaceSimulation'
import { PROTOTYPE_TRACK, type TrackCircle, type TrackRect } from './track'

/** True when a marble circle overlaps a (possibly rotated) rectangle. */
function circleOverlapsRect(
  cx: number,
  cy: number,
  radius: number,
  rect: TrackRect,
): boolean {
  const angle = (rect.angleDeg * Math.PI) / 180
  const dx = cx - rect.cx
  const dy = cy - rect.cy
  const localX = dx * Math.cos(angle) + dy * Math.sin(angle)
  const localY = -dx * Math.sin(angle) + dy * Math.cos(angle)
  const nearestX = Math.min(Math.max(localX, -rect.halfW), rect.halfW)
  const nearestY = Math.min(Math.max(localY, -rect.halfH), rect.halfH)
  const distX = localX - nearestX
  const distY = localY - nearestY
  return distX * distX + distY * distY < radius * radius
}

function circleOverlapsCircle(
  ax: number,
  ay: number,
  aRadius: number,
  circle: TrackCircle,
): boolean {
  const distance = Math.hypot(ax - circle.cx, ay - circle.cy)
  return distance < aRadius + circle.radius
}

describe('track data', () => {
  it('defines the default 10 start positions', () => {
    expect(PROTOTYPE_TRACK.startPositions).toHaveLength(DEFAULT_MARBLES)
  })

  it('exposes bounds, walls, obstacles, start zone, finish line and centerline', () => {
    expect(PROTOTYPE_TRACK.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: PROTOTYPE_TRACK.width,
      maxY: PROTOTYPE_TRACK.height,
    })
    expect(PROTOTYPE_TRACK.walls.length).toBeGreaterThan(0)
    expect(PROTOTYPE_TRACK.obstacles.bars.length).toBeGreaterThan(0)
    expect(PROTOTYPE_TRACK.obstacles.pegs.length).toBeGreaterThan(0)
    expect(PROTOTYPE_TRACK.startZone.minY).toBe(PROTOTYPE_TRACK.startLineY)
    expect(PROTOTYPE_TRACK.startZone.maxY).toBe(PROTOTYPE_TRACK.height)
    expect(PROTOTYPE_TRACK.finishLine.y).toBeGreaterThan(0)
    expect(PROTOTYPE_TRACK.finishLine.sensor.halfW).toBe(PROTOTYPE_TRACK.width / 2)
    expect(PROTOTYPE_TRACK.centerline.length).toBeGreaterThan(1)
    expect(PROTOTYPE_TRACK.centerline[0].y).toBeGreaterThan(
      PROTOTYPE_TRACK.centerline[PROTOTYPE_TRACK.centerline.length - 1].y,
    )
  })
})

describe('marble spawning', () => {
  const defs = MARBLES.slice(0, DEFAULT_MARBLES).map((marble) => ({
    id: marble.id,
  }))
  const sim = new MarbleRaceSimulation(defs)
  const track = PROTOTYPE_TRACK

  it('creates one marble per active definition', () => {
    expect(sim.marbles).toHaveLength(DEFAULT_MARBLES)
    expect(sim.marbles.map((marble) => marble.id)).toEqual(
      defs.map((marble) => marble.id),
    )
  })

  it('spawns no two marbles overlapping (all pairs at least a diameter apart)', () => {
    let minPairDistance = Infinity
    for (let i = 0; i < sim.marbles.length; i += 1) {
      const a = sim.marbles[i]
      for (let j = i + 1; j < sim.marbles.length; j += 1) {
        const b = sim.marbles[j]
        minPairDistance = Math.min(
          minPairDistance,
          Math.hypot(a.x - b.x, a.y - b.y),
        )
      }
    }
    expect(minPairDistance).toBeGreaterThan(MARBLE_DIAMETER + 0.01)
  })

  it('spawns no marble inside walls or obstacles', () => {
    const geometry = [...track.walls, ...track.obstacles.bars]
    for (const marble of sim.marbles) {
      expect(marble.x - MARBLE_RADIUS).toBeGreaterThanOrEqual(track.bounds.minX)
      expect(marble.x + MARBLE_RADIUS).toBeLessThanOrEqual(track.bounds.maxX)
      expect(marble.y - MARBLE_RADIUS).toBeGreaterThanOrEqual(track.bounds.minY)
      expect(marble.y + MARBLE_RADIUS).toBeLessThanOrEqual(track.bounds.maxY)
      for (const rect of geometry) {
        expect(circleOverlapsRect(marble.x, marble.y, MARBLE_RADIUS, rect)).toBe(false)
      }
      for (const peg of track.obstacles.pegs) {
        expect(circleOverlapsCircle(marble.x, marble.y, MARBLE_RADIUS, peg)).toBe(false)
      }
    }
  })
})
