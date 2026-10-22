import { describe, expect, it } from 'vitest'
import { FIXED_TIME_STEP, HARD_RACE_LIMIT_S } from '../config'
import { MARBLES } from '../data'
import { MarbleRaceSimulation } from '../physics/MarbleRaceSimulation'
import { RaceController } from './RaceController'

/** Long enough for the hard race limit to elapse plus margin. */
const FULL_RACE_STEPS = Math.ceil((HARD_RACE_LIMIT_S + 5) / FIXED_TIME_STEP)

/**
 * The controller owns its simulation privately and drives it from the
 * animation frame loop, which needs a canvas. The tests have no canvas, so
 * they reach for the simulation and step it by hand — the very same
 * fixed timestep the frame loop uses.
 */
function simOf(controller: RaceController): MarbleRaceSimulation {
  return (controller as unknown as { sim: MarbleRaceSimulation }).sim
}

/** Runs the race of a controller to its very end. */
function runRace(controller: RaceController): void {
  controller.start()
  const sim = simOf(controller)
  for (let step = 0; step < FULL_RACE_STEPS && !sim.isCompleted(); step += 1) {
    sim.step(FIXED_TIME_STEP)
  }
}

describe('marble customization rules', () => {
  it('rejects an empty name', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, { name: '   ' })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(controller.getMarbleConfigs()[0].name).toBe(MARBLES[0].name)
  })

  it('rejects a name that is too long', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, {
      name: 'x'.repeat(13),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(controller.getMarbleConfigs()[0].name).toBe(MARBLES[0].name)
  })

  it('rejects a duplicate name, ignoring the case', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, {
      name: MARBLES[1].name.toUpperCase(),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(controller.getMarbleConfigs()[0].name).toBe(MARBLES[0].name)
  })

  it('trims the name it stores', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, {
      name: '   Nova   ',
    })

    expect(result.ok).toBe(true)
    expect(controller.getMarbleConfigs()[0].name).toBe('Nova')
  })

  it('lets a marble keep its own name', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, {
      name: MARBLES[0].name.toLowerCase(),
    })

    expect(result.ok).toBe(true)
    expect(controller.getMarbleConfigs()[0].name).toBe(
      MARBLES[0].name.toLowerCase(),
    )
  })

  it('rejects a color that another marble already uses', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, {
      color: MARBLES[1].color,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(controller.getMarbleConfigs()[0].color).toBe(MARBLES[0].color)
  })

  it('rejects a color that is too dark to read', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, {
      color: '#101010',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(controller.getMarbleConfigs()[0].color).toBe(MARBLES[0].color)
  })

  it('accepts a fresh name and color together', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, {
      name: 'Nova',
      color: '#00ff88',
    })

    expect(result.ok).toBe(true)
    const marble = controller.getMarbleConfigs()[0]
    expect(marble.name).toBe('Nova')
    expect(marble.color).toBe('#00ff88')
  })

  it('changes nothing when one half of the edit is invalid', () => {
    const controller = new RaceController()
    const result = controller.setMarbleConfig(MARBLES[0].id, {
      name: 'Nova',
      color: MARBLES[1].color,
    })

    expect(result.ok).toBe(false)
    const marble = controller.getMarbleConfigs()[0]
    expect(marble.name).toBe(MARBLES[0].name)
    expect(marble.color).toBe(MARBLES[0].color)
  })

  it('restores the defaults on reset', () => {
    const controller = new RaceController()
    controller.setMarbleConfig(MARBLES[0].id, {
      name: 'Nova',
      color: '#00ff88',
    })

    controller.resetMarbleConfigs()

    expect(controller.getMarbleConfigs()[0].name).toBe(MARBLES[0].name)
    expect(controller.getMarbleConfigs()[0].color).toBe(MARBLES[0].color)
  })
})

describe('customization while the race runs', () => {
  it('rejects every edit while the race is running', () => {
    const controller = new RaceController()
    const before = controller.getMarbleConfigs()[0]
    controller.start()
    expect(controller.getSnapshot().state).toBe('Running')

    const result = controller.setMarbleConfig(MARBLES[0].id, { name: 'Nova' })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(controller.setMarbleName(MARBLES[0].id, 'Nova').ok).toBe(false)
    expect(controller.setMarbleColor(MARBLES[0].id, '#00ff88').ok).toBe(false)

    controller.resetMarbleConfigs()

    const after = controller.getMarbleConfigs()[0]
    expect(after.name).toBe(before.name)
    expect(after.color).toBe(before.color)
  })
})

describe('the recorded history', () => {
  it('records exactly one entry per completed race', () => {
    const controller = new RaceController()
    runRace(controller)

    expect(controller.getSnapshot().state).toBe('Completed')
    expect(controller.getHistory()).toHaveLength(1)

    // Every later publish must not write the same race a second time.
    controller.setSpeed(2)
    expect(controller.getHistory()).toHaveLength(1)

    controller.reset()
    runRace(controller)
    const history = controller.getHistory()
    expect(history).toHaveLength(2)
    expect(history[0].id).not.toBe(history[1].id)
  })

  it('keeps the names and colors of the race, not of a later edit', () => {
    const controller = new RaceController()
    controller.setMarbleConfig(MARBLES[0].id, {
      name: 'Nova',
      color: '#00ff88',
    })
    runRace(controller)

    const recorded = controller.getHistory()[0]
    const snapshot = recorded.marbleSnapshots.find(
      (marble) => marble.id === MARBLES[0].id,
    )
    expect(snapshot?.name).toBe('Nova')
    expect(snapshot?.color).toBe('#00ff88')

    controller.reset()
    controller.setMarbleConfig(MARBLES[0].id, { name: 'Renamed' })

    const stillRecorded = controller.getHistory()[0]
    const stillSnapshot = stillRecorded.marbleSnapshots.find(
      (marble) => marble.id === MARBLES[0].id,
    )
    expect(stillSnapshot?.name).toBe('Nova')
    expect(stillSnapshot?.color).toBe('#00ff88')
  })

  it('records the finishing order without inventing a place for a DNF', () => {
    const controller = new RaceController()
    controller.start()
    const sim = simOf(controller)

    // Retire one marble the way the recovery manager does when the attempts
    // of a stuck marble run out.
    const index = sim.marbles.findIndex((marble) => marble.status === 'racing')
    const dnfId = sim.marbles[index].id
    sim.markDnf(index, 'recovery-failed')
    for (let step = 0; step < FULL_RACE_STEPS && !sim.isCompleted(); step += 1) {
      sim.step(FIXED_TIME_STEP)
    }

    const standing = controller
      .getSnapshot()
      .standings.find((marble) => marble.id === dnfId)
    expect(standing?.status).toBe('dnf')
    expect(standing?.place).toBeNull()
    expect(standing?.timeSec).toBeNull()

    const entry = controller.getHistory()[0]
    expect(entry.dnfList.map((dnf) => dnf.marbleId)).toContain(dnfId)
    expect(entry.results.map((result) => result.marbleId)).not.toContain(dnfId)
    for (const result of entry.results) {
      expect(result.place).toBeGreaterThan(0)
      expect(result.timeSec).toBeGreaterThan(0)
    }
  })
})

describe('resetting and racing again', () => {
  it('keeps the seed when the race is reset', () => {
    const controller = new RaceController()
    const seed = controller.getSnapshot().seed

    controller.reset()

    expect(controller.getSnapshot().seed).toBe(seed)
    expect(controller.getSnapshot().state).toBe('Ready')
  })

  it('keeps the seed and the marbles when the race is reset', () => {
    const controller = new RaceController()
    controller.setMarbleConfig(MARBLES[0].id, {
      name: 'Nova',
      color: '#00ff88',
    })
    const seed = controller.getSnapshot().seed

    controller.reset()

    expect(controller.getSnapshot().seed).toBe(seed)
    const marble = controller.getMarbleConfigs()[0]
    expect(marble.name).toBe('Nova')
    expect(marble.color).toBe('#00ff88')
  })

  it('racing again uses a new seed and keeps the names and colors', () => {
    const controller = new RaceController()
    controller.setMarbleConfig(MARBLES[0].id, {
      name: 'Nova',
      color: '#00ff88',
    })
    runRace(controller)

    const seedBefore = controller.getSnapshot().seed
    const nextSeed = controller.raceAgain()

    expect(nextSeed).not.toBe(seedBefore)
    expect(controller.getSnapshot().seed).toBe(nextSeed)
    expect(controller.getSnapshot().state).toBe('Ready')
    expect(controller.getHistory()).toHaveLength(1)

    const marble = controller.getMarbleConfigs()[0]
    expect(marble.name).toBe('Nova')
    expect(marble.color).toBe('#00ff88')
  })
})
