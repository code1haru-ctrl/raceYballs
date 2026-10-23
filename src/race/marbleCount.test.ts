import { describe, expect, it } from 'vitest'
import {
  FIXED_TIME_STEP,
  HARD_RACE_LIMIT_S,
  MAX_MARBLES,
  MIN_MARBLES,
} from '../config'
import { MARBLES } from '../data'
import { MarbleRaceSimulation } from '../physics/MarbleRaceSimulation'
import { buildTrack } from '../track/generate'
import { isColorTooDark } from './marbleCustomization'
import { RaceController } from './RaceController'
import { RecoveryManager } from './recovery'

const FULL_RACE_STEPS = Math.ceil((HARD_RACE_LIMIT_S + 5) / FIXED_TIME_STEP)

function simOf(controller: RaceController): MarbleRaceSimulation {
  return (controller as unknown as { sim: MarbleRaceSimulation }).sim
}

function runRace(controller: RaceController): void {
  controller.start()
  const sim = simOf(controller)
  for (let step = 0; step < FULL_RACE_STEPS && !sim.isCompleted(); step += 1) {
    sim.step(FIXED_TIME_STEP)
  }
}

function defsFor(count: number) {
  return MARBLES.slice(0, count).map((marble) => ({ id: marble.id }))
}

describe('selecting the marble count', () => {
  it('defaults to 10 and exposes all 20 slots', () => {
    const controller = new RaceController()
    expect(controller.getSnapshot().marbleCount).toBe(10)
    expect(controller.getMarbleConfigs()).toHaveLength(MAX_MARBLES)
    expect(simOf(controller).marbles).toHaveLength(10)
  })

  it('rejects counts outside 2..20, including non-integers', () => {
    const controller = new RaceController()
    for (const value of [
      MIN_MARBLES - 1,
      MAX_MARBLES + 1,
      0,
      2.5,
      Number.NaN,
    ]) {
      const result = controller.setMarbleCount(value)
      expect(result.ok).toBe(false)
      expect(result.error).toBeTruthy()
    }
    expect(controller.getSnapshot().marbleCount).toBe(10)
  })

  it('rejects a count change while Running or Completed', () => {
    const running = new RaceController()
    running.start()
    expect(running.setMarbleCount(5).ok).toBe(false)

    const completed = new RaceController()
    runRace(completed)
    expect(completed.getSnapshot().state).toBe('Completed')
    expect(completed.setMarbleCount(5).ok).toBe(false)
  })

  it('rebuilds the field for the same track and seed while Ready', () => {
    const controller = new RaceController()
    const before = controller.getSnapshot()
    const previousSim = simOf(controller)

    expect(controller.setMarbleCount(MAX_MARBLES).ok).toBe(true)

    const after = controller.getSnapshot()
    expect(after.state).toBe('Ready')
    expect(after.marbleCount).toBe(MAX_MARBLES)
    expect(after.trackId).toBe(before.trackId)
    expect(after.seed).toBe(before.seed)
    expect(simOf(controller)).not.toBe(previousSim)
    expect(simOf(controller).marbles).toHaveLength(MAX_MARBLES)
    expect(simOf(controller).track.obstacles).toEqual(
      previousSim.track.obstacles,
    )
  })

  it('keeps the count through Reset and Race Again', () => {
    const controller = new RaceController()
    controller.setMarbleCount(2)

    controller.reset()
    expect(controller.getSnapshot().marbleCount).toBe(2)

    runRace(controller)
    const seedBefore = controller.getSnapshot().seed
    const nextSeed = controller.raceAgain()
    expect(nextSeed).not.toBe(seedBefore)
    expect(controller.getSnapshot().marbleCount).toBe(2)
    expect(simOf(controller).marbles).toHaveLength(2)
  })
})

describe('customisation across a count change', () => {
  it('keeps edits to active and reserve slots', () => {
    const controller = new RaceController()
    expect(
      controller.setMarbleConfig(MARBLES[0].id, {
        name: 'Nova',
        color: '#00ff88',
      }).ok,
    ).toBe(true)
    expect(
      controller.setMarbleConfig(MARBLES[MAX_MARBLES - 1].id, {
        name: 'Reserve',
        color: '#808080',
      }).ok,
    ).toBe(true)

    controller.setMarbleCount(2)
    controller.setMarbleCount(MAX_MARBLES)

    const configs = controller.getMarbleConfigs()
    expect(configs[0].name).toBe('Nova')
    expect(configs[0].color).toBe('#00ff88')
    expect(configs[MAX_MARBLES - 1].name).toBe('Reserve')
    expect(configs[MAX_MARBLES - 1].color).toBe('#808080')
  })

  it('checks name and color uniqueness across all 20 slots, active or not', () => {
    const controller = new RaceController()
    controller.setMarbleCount(MIN_MARBLES)

    expect(
      controller.setMarbleConfig(MARBLES[0].id, {
        name: MARBLES[MAX_MARBLES - 1].name.toUpperCase(),
      }).ok,
    ).toBe(false)
    expect(
      controller.setMarbleConfig(MARBLES[0].id, {
        color: MARBLES[MAX_MARBLES - 1].color,
      }).ok,
    ).toBe(false)
  })

  it('ships 20 unique, valid default names and readable colors', () => {
    expect(MARBLES).toHaveLength(MAX_MARBLES)
    const names = new Set(MARBLES.map((marble) => marble.name.toLowerCase()))
    const colors = new Set(MARBLES.map((marble) => marble.color.toLowerCase()))
    expect(names.size).toBe(MAX_MARBLES)
    expect(colors.size).toBe(MAX_MARBLES)
    for (const marble of MARBLES) {
      expect(marble.name.length).toBeGreaterThanOrEqual(1)
      expect(marble.name.length).toBeLessThanOrEqual(12)
      expect(isColorTooDark(marble.color)).toBe(false)
    }
  })
})

describe('completion for variable fields', () => {
  for (const count of [MIN_MARBLES, 10, MAX_MARBLES]) {
    it(`fires exactly once for ${count} marbles with finished and DNF`, () => {
      const track = buildTrack('neon-circuit', 1, count)
      const sim = new MarbleRaceSimulation(defsFor(count), track)
      const recovery = new RecoveryManager(track)
      let completions = 0
      sim.onComplete = () => {
        completions += 1
      }

      // One marble is out before the start, so the race always ends with a
      // mix of finishers and at least one DNF.
      sim.markDnf(0, 'recovery-failed')

      for (
        let step = 0;
        step < FULL_RACE_STEPS && !sim.isCompleted();
        step += 1
      ) {
        sim.step(FIXED_TIME_STEP)
        recovery.update(sim)
      }

      expect(sim.isCompleted()).toBe(true)
      expect(completions).toBe(1)
      expect(sim.finishedCount()).toBeGreaterThan(0)
      expect(sim.dnfCount()).toBeGreaterThan(0)
      expect(sim.finishedCount() + sim.dnfCount()).toBe(count)

      for (let step = 0; step < 10; step += 1) sim.step(FIXED_TIME_STEP)
      expect(completions).toBe(1)
    })
  }
})

describe('history and snapshots for variable fields', () => {
  it('stores the count and only the active marbles', () => {
    const controller = new RaceController()
    controller.setMarbleCount(2)
    runRace(controller)

    const entry = controller.getHistory()[0]
    expect(entry.marbleCount).toBe(2)
    expect(entry.marbleSnapshots).toHaveLength(2)
    expect(entry.marbleSnapshots.map((marble) => marble.id)).toEqual(
      MARBLES.slice(0, 2).map((marble) => marble.id),
    )
    const activeIds = new Set(entry.marbleSnapshots.map((marble) => marble.id))
    expect(entry.results.every((result) => activeIds.has(result.marbleId))).toBe(
      true,
    )
    expect(entry.dnfList.every((dnf) => activeIds.has(dnf.marbleId))).toBe(true)

    const snapshot = controller.getSnapshot()
    expect(snapshot.marbleCount).toBe(2)
    expect(snapshot.marbles).toHaveLength(2)
    expect(snapshot.standings).toHaveLength(2)
  })
})
