import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARBLES,
  FIXED_TIME_STEP,
  HARD_RACE_LIMIT_S,
} from '../config'
import { MARBLES } from '../data'
import type { TrackData } from '../track/track'
import { MarbleRaceSimulation, type MarbleState } from './MarbleRaceSimulation'

const DEFS = MARBLES.slice(0, DEFAULT_MARBLES).map((marble) => ({ id: marble.id }))
/** Long enough for the hard race limit to elapse plus margin. */
const FULL_RACE_STEPS = Math.ceil((HARD_RACE_LIMIT_S + 5) / FIXED_TIME_STEP)

function finishedInOrder(states: readonly MarbleState[]): MarbleState[] {
  return states
    .filter((state) => state.finished)
    .sort((a, b) => (a.finishOrder ?? 0) - (b.finishOrder ?? 0))
}

describe('stepping the simulation', () => {
  it('finishes marbles at the finish line (seedless, fixed timestep)', () => {
    const sim = new MarbleRaceSimulation(DEFS)
    const states = sim.advanceSteps(FULL_RACE_STEPS)
    const finished = states.filter((state) => state.finished)

    expect(sim.isCompleted()).toBe(true)
    expect(finished.length).toBeGreaterThanOrEqual(1)
    for (const state of finished) {
      expect(state.finishOrder).not.toBeNull()
      expect(state.finishTime).not.toBeNull()
      expect(state.finishTime ?? 0).toBeGreaterThan(0)
      expect(state.finishTime ?? Infinity).toBeLessThan(HARD_RACE_LIMIT_S)
    }

    console.log(
      `[report] ${finished.length}/${states.length} marbles finished at the finish line; last at ${Math.max(
        ...finished.map((state) => state.finishTime ?? 0),
      ).toFixed(2)}s simulated`,
    )
  })

  it('records finish order as 1..N with strictly increasing finish times', () => {
    const sim = new MarbleRaceSimulation(DEFS)
    const finished = finishedInOrder(sim.advanceSteps(FULL_RACE_STEPS))

    expect(finished.length).toBeGreaterThanOrEqual(1)
    const orders = finished.map((state) => state.finishOrder)
    expect(new Set(orders).size).toBe(orders.length)
    expect(orders).toEqual(finished.map((_, index) => index + 1))

    finished.forEach((state, index) => {
      if (index === 0) return
      expect(state.finishTime ?? 0).toBeGreaterThan(finished[index - 1].finishTime ?? 0)
    })
  })

  it('gives identical states for identical step sequences on fresh worlds', () => {
    const a = new MarbleRaceSimulation(DEFS)
    const b = new MarbleRaceSimulation(DEFS)
    const statesA = a.advanceSteps(600)
    const statesB = b.advanceSteps(600)
    expect(statesA).toEqual(statesB)

    const c = new MarbleRaceSimulation(DEFS)
    expect(c.advanceSteps(601)).not.toEqual(statesA)
  })
})

describe('reset', () => {
  it('restores starting positions and velocities and clears the finish order', () => {
    const sim = new MarbleRaceSimulation(DEFS)
    const freshStates = sim.marbleStates()

    sim.advanceSteps(FULL_RACE_STEPS)
    expect(sim.marbleStates().some((state) => state.finished)).toBe(true)

    sim.reset(DEFS)
    expect(sim.marbleStates()).toEqual(freshStates)
    expect(sim.marbleStates().every((state) => !state.finished)).toBe(true)
    expect(sim.finishedCount()).toBe(0)
    expect(sim.dnfCount()).toBe(0)
    expect(sim.elapsed()).toBe(0)
    expect(sim.isCompleted()).toBe(false)
  })
})

/** A sealed box whose finish line sits below the floor, so nobody can reach it. */
const SEALED_TRACK: TrackData = {
  id: 'sealed-test-box',
  name: 'Sealed Test Box',
  width: 20,
  height: 20,
  bounds: { minX: 0, minY: 0, maxX: 20, maxY: 20 },
  walls: [
    { cx: -2, cy: 10, halfW: 2, halfH: 14, angleDeg: 0 },
    { cx: 22, cy: 10, halfW: 2, halfH: 14, angleDeg: 0 },
    { cx: 10, cy: -2, halfW: 14, halfH: 2, angleDeg: 0 },
    { cx: 10, cy: 22, halfW: 14, halfH: 2, angleDeg: 0 },
  ],
  obstacles: { bars: [], pegs: [] },
  startLineY: 16,
  startZone: { minX: 0, minY: 16, maxX: 20, maxY: 20 },
  startPositions: [
    { x: 5, y: 12 },
    { x: 15, y: 12 },
  ],
  finishLine: {
    y: -50,
    zone: { minX: 0, minY: -52, maxX: 20, maxY: -48 },
    sensor: { cx: 10, cy: -50, halfW: 10, halfH: 2 },
  },
  centerline: [
    { x: 5, y: 12 },
    { x: 15, y: 12 },
    { x: 10, y: -50 },
  ],
}

describe('hard race limit', () => {
  it('marks marbles that are still racing at the limit as DNF, never as finished', () => {
    const sim = new MarbleRaceSimulation(
      [{ id: 'sealed-one' }, { id: 'sealed-two' }],
      SEALED_TRACK,
    )
    const states = sim.advanceSteps(FULL_RACE_STEPS)

    expect(sim.isCompleted()).toBe(true)
    expect(sim.finishedCount()).toBe(0)
    expect(sim.dnfCount()).toBe(states.length)
    for (const state of states) {
      expect(state.finished).toBe(false)
      expect(state.dnf).toBe(true)
      expect(state.finishOrder).toBeNull()
      expect(state.finishTime).toBeNull()
    }
    expect(sim.marbles.every((marble) => marble.status === 'dnf')).toBe(true)
  })
})
