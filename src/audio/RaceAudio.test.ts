import { describe, expect, it } from 'vitest'
import { FIXED_TIME_STEP, HARD_RACE_LIMIT_S } from '../config'
import { MARBLES } from '../data'
import { MarbleRaceSimulation } from '../physics/MarbleRaceSimulation'
import { RaceController } from '../race/RaceController'
import type { RaceEvent } from '../race/raceEvents'
import { buildTrack, DEFAULT_SEEDS } from '../track/generate'
import { RaceAudio } from './RaceAudio'
import { FakeAudioContext } from './testing/fakeAudio'

const FULL_RACE_STEPS = Math.ceil((HARD_RACE_LIMIT_S + 5) / FIXED_TIME_STEP)

function simOf(controller: RaceController): MarbleRaceSimulation {
  return (controller as unknown as { sim: MarbleRaceSimulation }).sim
}

describe('race audio integration', () => {
  it('does not change track generation or finish order', async () => {
    const plain = new RaceController()
    const withAudio = new RaceController()
    const audio = new RaceAudio({
      contextFactory: () => new FakeAudioContext(),
      rng: { next: () => 0.4 },
    })
    audio.attach(withAudio)
    await audio.unlock()

    plain.start()
    withAudio.start()
    const plainSim = simOf(plain)
    const audioSim = simOf(withAudio)

    for (
      let step = 0;
      step < FULL_RACE_STEPS &&
      (!plainSim.isCompleted() || !audioSim.isCompleted());
      step += 1
    ) {
      plainSim.step(FIXED_TIME_STEP)
      audioSim.step(FIXED_TIME_STEP)
    }

    expect(audioSim.track).toEqual(plainSim.track)
    expect(withAudio.getSnapshot().seed).toBe(plain.getSnapshot().seed)
    expect(withAudio.getSnapshot().results).toEqual(
      plain.getSnapshot().results,
    )
    expect(withAudio.getSnapshot().finishedCount).toBe(
      plain.getSnapshot().finishedCount,
    )

    audio.dispose()
  })

  it('emits only a silence event on reset', () => {
    const controller = new RaceController()
    const events: RaceEvent[] = []
    controller.subscribeRaceEvents((event) => events.push(event))

    controller.start()
    const sim = simOf(controller)
    for (let step = 0; step < 240; step += 1) sim.step(FIXED_TIME_STEP)

    const marker = events.length
    controller.reset()

    const afterReset = events.slice(marker)
    expect(afterReset).toEqual([{ type: 'silence', reason: 'reset' }])
    expect(
      afterReset.some(
        (event) => event.type === 'collision' || event.type === 'overtake',
      ),
    ).toBe(false)
  })

  it('emits only a silence event on Race Again', () => {
    const controller = new RaceController()
    const events: RaceEvent[] = []
    controller.subscribeRaceEvents((event) => events.push(event))

    controller.start()
    const sim = simOf(controller)
    for (
      let step = 0;
      step < FULL_RACE_STEPS && !sim.isCompleted();
      step += 1
    ) {
      sim.step(FIXED_TIME_STEP)
    }

    const marker = events.length
    controller.raceAgain()

    const afterRaceAgain = events.slice(marker)
    expect(afterRaceAgain).toEqual([
      { type: 'silence', reason: 'race-again' },
    ])
    expect(
      afterRaceAgain.some(
        (event) => event.type === 'collision' || event.type === 'overtake',
      ),
    ).toBe(false)
  })

  it('mutes contacts caused by a recovery teleport', () => {
    const sim = new MarbleRaceSimulation(
      MARBLES.map((marble) => ({ id: marble.id })),
      buildTrack('neon-circuit', DEFAULT_SEEDS['neon-circuit']),
    )
    const teleportedId = sim.marbles[0].id
    const collisions: string[] = []
    sim.onCollision = (event) => collisions.push(event.marbleId)

    // Drop a marble onto the floor with a hard downward velocity while the
    // post-teleport suppression window is active.
    expect(sim.teleportMarble(0, 20, 1.3)).toBe(true)
    const body = (
      sim as unknown as {
        bodies: {
          setLinearVelocity(v: { x: number; y: number }): void
          setAwake(awake: boolean): void
        }[]
      }
    ).bodies[0]
    body.setLinearVelocity({ x: 0, y: -20 })

    for (let step = 0; step < 5; step += 1) sim.step(FIXED_TIME_STEP)
    expect(collisions.filter((id) => id === teleportedId)).toHaveLength(0)

    // After the window closes the same contact is reportable again.
    for (let step = 0; step < 22; step += 1) sim.step(FIXED_TIME_STEP)
    body.setAwake(true)
    body.setLinearVelocity({ x: 0, y: -20 })
    for (let step = 0; step < 3; step += 1) sim.step(FIXED_TIME_STEP)
    expect(collisions).toContain(teleportedId)
  })
})
