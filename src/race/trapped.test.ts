import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARBLES,
  FIXED_TIME_STEP,
  HARD_RACE_LIMIT_S,
  MAX_RECOVERY_ATTEMPTS,
} from '../config'
import { MARBLES } from '../data'
import {
  MarbleRaceSimulation,
  type DnfEvent,
  type MarbleDefinition,
} from '../physics/MarbleRaceSimulation'
import { buildTrack, DEFAULT_SEEDS } from '../track/generate'
import type { TrackData } from '../track/track'
import { CenterlinePath } from './progress'
import { RecoveryManager, type RecoveryEvent } from './recovery'

/**
 * A straight course with a cup on the left that swallows the first marble.
 * The cup is open at the top, so the marble can fall in but cannot get out.
 */
const TRAP_TRACK: TrackData = {
  id: 'trap-track',
  name: 'Trap Track',
  width: 40,
  height: 60,
  bounds: { minX: 0, minY: 0, maxX: 40, maxY: 60 },
  walls: [
    { cx: -3, cy: 30, halfW: 3, halfH: 33, angleDeg: 0 },
    { cx: 43, cy: 30, halfW: 3, halfH: 33, angleDeg: 0 },
    { cx: 20, cy: -3, halfW: 23, halfH: 3, angleDeg: 0 },
    { cx: 20, cy: 63, halfW: 23, halfH: 3, angleDeg: 0 },
  ],
  obstacles: {
    bars: [
      { cx: 6, cy: 30, halfW: 4, halfH: 0.4, angleDeg: 0 },
      { cx: 2.4, cy: 33, halfW: 0.4, halfH: 3, angleDeg: 0 },
      { cx: 9.6, cy: 33, halfW: 0.4, halfH: 3, angleDeg: 0 },
    ],
    pegs: [],
  },
  startLineY: 54,
  startZone: { minX: 0, minY: 54, maxX: 40, maxY: 60 },
  startPositions: [
    { x: 6, y: 32 },
    { x: 20, y: 56 },
  ],
  finishLine: {
    y: 4,
    zone: { minX: 0, minY: 2, maxX: 40, maxY: 6 },
    sensor: { cx: 20, cy: 4, halfW: 20, halfH: 2 },
  },
  centerline: [
    { x: 20, y: 56 },
    { x: 20, y: 44 },
    { x: 20, y: 32 },
    { x: 20, y: 20 },
    { x: 20, y: 8 },
  ],
}

/** A course whose only racing line runs through a shaft too tight to use. */
const SHAFT_TRACK: TrackData = {
  ...TRAP_TRACK,
  id: 'shaft-track',
  name: 'Shaft Track',
  obstacles: {
    bars: [
      { cx: 16, cy: 30, halfW: 1, halfH: 30, angleDeg: 0 },
      { cx: 24, cy: 30, halfW: 1, halfH: 30, angleDeg: 0 },
    ],
    pegs: [],
  },
  startPositions: [{ x: 20, y: 50 }],
  centerline: [
    { x: 20, y: 50 },
    { x: 20, y: 30 },
    { x: 20, y: 8 },
  ],
  // The finish line sits below the floor, so the marble can never reach it.
  finishLine: {
    y: -50,
    zone: { minX: 0, minY: -52, maxX: 40, maxY: -48 },
    sensor: { cx: 20, cy: -50, halfW: 20, halfH: 2 },
  },
}

const TRAP_DEFS: MarbleDefinition[] = [{ id: 'trapped' }, { id: 'runner' }]
const SHAFT_DEFS: MarbleDefinition[] = [{ id: 'shafted' }]

interface RaceRun {
  sim: MarbleRaceSimulation
  recovery: RecoveryManager
  recoveries: RecoveryEvent[]
  dnfEvents: DnfEvent[]
  completions: number
  /** Best progress each marble ever showed, sampled every step. */
  observedBest: Map<number, number>
}

/** Runs a race with the stuck detector and the recovery manager attached. */
function runRace(
  defs: MarbleDefinition[],
  track: TrackData,
  seconds: number,
): RaceRun {
  const sim = new MarbleRaceSimulation(defs, track)
  const recovery = new RecoveryManager(track)
  const path = new CenterlinePath(track.centerline)

  const recoveries: RecoveryEvent[] = []
  const dnfEvents: DnfEvent[] = []
  const observedBest = new Map<number, number>()
  let completions = 0

  recovery.onRecover = (event) => recoveries.push(event)
  sim.onDnf = (event) => dnfEvents.push(event)
  sim.onComplete = () => {
    completions += 1
  }

  const steps = Math.ceil(seconds / FIXED_TIME_STEP)
  for (let step = 0; step < steps; step += 1) {
    if (sim.isCompleted()) break

    sim.step(FIXED_TIME_STEP)

    for (let index = 0; index < sim.marbles.length; index += 1) {
      const marble = sim.marbles[index]
      if (marble.status !== 'racing') continue
      const progress = path.progressAt(marble.x, marble.y)
      observedBest.set(index, Math.max(observedBest.get(index) ?? 0, progress))
    }

    recovery.update(sim)
  }

  return { sim, recovery, recoveries, dnfEvents, completions, observedBest }
}

describe('trapped marble', () => {
  it('is put back on the racing line and still finishes', () => {
    const run = runRace(TRAP_DEFS, TRAP_TRACK, 60)

    expect(run.recoveries.length).toBeGreaterThanOrEqual(1)
    expect(run.sim.finishedCount()).toBe(2)
    expect(run.sim.dnfCount()).toBe(0)
    expect(run.sim.marbles[0].status).toBe('finished')
    expect(run.sim.marbles[0].place).not.toBeNull()
    expect(run.sim.marbles[0].timeSec).not.toBeNull()
  })

  it('is never dropped ahead of the progress it had reached', () => {
    const run = runRace(TRAP_DEFS, TRAP_TRACK, 60)

    expect(run.recoveries.length).toBeGreaterThanOrEqual(1)
    for (const event of run.recoveries) {
      const best = run.observedBest.get(event.index) ?? 0
      expect(event.progress).toBeLessThanOrEqual(best)
    }
  })

  it('completes the race exactly once', () => {
    const run = runRace(TRAP_DEFS, TRAP_TRACK, 60)

    expect(run.sim.isCompleted()).toBe(true)
    expect(run.completions).toBe(1)
  })
})

describe('marble that cannot be rescued', () => {
  it('becomes a DNF after the attempts run out', () => {
    const run = runRace(SHAFT_DEFS, SHAFT_TRACK, 60)

    expect(run.sim.dnfCount()).toBe(1)
    expect(run.sim.finishedCount()).toBe(0)
    expect(run.sim.marbles[0].status).toBe('dnf')
    expect(run.sim.marbles[0].place).toBeNull()
    expect(run.sim.marbles[0].timeSec).toBeNull()
    expect(run.dnfEvents).toHaveLength(1)
    expect(run.dnfEvents[0].reason).toBe('recovery-failed')
  })

  it('uses every attempt and never invents a finish', () => {
    const run = runRace(SHAFT_DEFS, SHAFT_TRACK, 60)

    // No spot on the racing line is wide enough, so no marble was moved.
    expect(run.recoveries).toHaveLength(0)
    expect(run.recovery.detector.attemptsFor(0)).toBe(MAX_RECOVERY_ATTEMPTS)
    expect(run.sim.marbles[0].place).toBeNull()
  })

  it('completes the race exactly once', () => {
    const run = runRace(SHAFT_DEFS, SHAFT_TRACK, 60)

    expect(run.sim.isCompleted()).toBe(true)
    expect(run.completions).toBe(1)
  })
})

describe('hard race limit', () => {
  it('marks a marble that is still racing at the limit as a DNF', () => {
    const sim = new MarbleRaceSimulation(SHAFT_DEFS, SHAFT_TRACK)
    const dnfEvents: DnfEvent[] = []
    let completions = 0
    sim.onDnf = (event) => dnfEvents.push(event)
    sim.onComplete = () => {
      completions += 1
    }

    const steps = Math.ceil((HARD_RACE_LIMIT_S + 5) / FIXED_TIME_STEP)
    for (let step = 0; step < steps; step += 1) {
      sim.step(FIXED_TIME_STEP)
    }

    expect(dnfEvents).toHaveLength(1)
    expect(dnfEvents[0].reason).toBe('race-timeout')
    expect(sim.dnfCount()).toBe(1)
    expect(sim.finishedCount()).toBe(0)
    expect(sim.isCompleted()).toBe(true)
    expect(completions).toBe(1)
  })
})

describe('shipped tracks', () => {
  const defs: MarbleDefinition[] = MARBLES.slice(0, DEFAULT_MARBLES).map(
    (marble) => ({ id: marble.id }),
  )

  for (const trackId of ['neon-circuit', 'chaos-canyon', 'gravity-gauntlet'] as const) {
    it(`${trackId} still finishes all ${DEFAULT_MARBLES} marbles with recovery enabled`, () => {
      const track = buildTrack(trackId, DEFAULT_SEEDS[trackId])
      const sim = new MarbleRaceSimulation(defs, track)
      const recovery = new RecoveryManager(track)

      const steps = Math.ceil(90 / FIXED_TIME_STEP)
      for (let step = 0; step < steps; step += 1) {
        if (sim.isCompleted()) break
        sim.step(FIXED_TIME_STEP)
        recovery.update(sim)
      }

      // The recovery must never retire a marble on a shipped track.
      expect(sim.dnfCount()).toBe(0)
      expect(sim.finishedCount()).toBe(DEFAULT_MARBLES)
      expect(sim.isCompleted()).toBe(true)
    })
  }
})
