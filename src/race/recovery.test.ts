import { describe, expect, it } from 'vitest'
import {
  MARBLE_DIAMETER,
  MAX_RECOVERY_ATTEMPTS,
  MIN_PROGRESS_D,
  RECOVERY_CLEARANCE_D,
  RECOVERY_COOLDOWN_S,
} from '../config'
import type { TrackData } from '../track/track'
import { CenterlinePath } from './progress'
import { geometryClearance, pickRecoveryCandidate } from './recovery'
import { StuckDetector, type StuckEvent, type StuckSample } from './stuck'

/** A plain open box with a straight racing line down the middle. */
const OPEN_TRACK: TrackData = {
  id: 'open-test-box',
  name: 'Open Test Box',
  width: 40,
  height: 60,
  bounds: { minX: 0, minY: 0, maxX: 40, maxY: 60 },
  walls: [
    { cx: -3, cy: 30, halfW: 3, halfH: 33, angleDeg: 0 },
    { cx: 43, cy: 30, halfW: 3, halfH: 33, angleDeg: 0 },
    { cx: 20, cy: -3, halfW: 23, halfH: 3, angleDeg: 0 },
    { cx: 20, cy: 63, halfW: 23, halfH: 3, angleDeg: 0 },
  ],
  obstacles: { bars: [], pegs: [] },
  startLineY: 54,
  startZone: { minX: 0, minY: 54, maxX: 40, maxY: 60 },
  startPositions: [{ x: 20, y: 56 }],
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

/** The same box, but the racing line runs down a narrow shaft. */
const SHAFT_TRACK: TrackData = {
  ...OPEN_TRACK,
  id: 'shaft-test-box',
  name: 'Shaft Test Box',
  obstacles: {
    bars: [
      { cx: 16, cy: 30, halfW: 1, halfH: 30, angleDeg: 0 },
      { cx: 24, cy: 30, halfW: 1, halfH: 30, angleDeg: 0 },
    ],
    pegs: [],
  },
}

const OPEN_PATH = new CenterlinePath(OPEN_TRACK.centerline)
const SHAFT_PATH = new CenterlinePath(SHAFT_TRACK.centerline)

describe('geometry clearance', () => {
  it('is large in open space', () => {
    expect(geometryClearance(OPEN_TRACK, 20, 30)).toBeGreaterThan(
      RECOVERY_CLEARANCE_D * MARBLE_DIAMETER,
    )
  })

  it('is negative inside an obstacle', () => {
    expect(geometryClearance(SHAFT_TRACK, 16, 30)).toBeLessThan(0)
  })

  it('measures the gap to the nearest wall', () => {
    // 3 units from the shaft wall, minus the marble radius.
    expect(geometryClearance(SHAFT_TRACK, 20, 30)).toBeCloseTo(3 - 1.1, 6)
  })
})

describe('recovery candidate', () => {
  it('is never ahead of the progress the marble already reached', () => {
    const candidate = pickRecoveryCandidate(OPEN_TRACK, OPEN_PATH, 12)
    expect(candidate).not.toBeNull()
    expect(candidate?.progress ?? Infinity).toBeLessThanOrEqual(12)
  })

  it('keeps the required clearance from the track geometry', () => {
    const candidate = pickRecoveryCandidate(OPEN_TRACK, OPEN_PATH, 48)
    expect(candidate).not.toBeNull()
    expect(candidate?.clearance ?? 0).toBeGreaterThanOrEqual(
      RECOVERY_CLEARANCE_D * MARBLE_DIAMETER,
    )
  })

  it('finds nothing when every spot on the line is too tight', () => {
    expect(pickRecoveryCandidate(SHAFT_TRACK, SHAFT_PATH, 40)).toBeNull()
  })

  it('refuses a spot that another marble is sitting on', () => {
    const spot = OPEN_PATH.pointAt(24)
    const candidate = pickRecoveryCandidate(OPEN_TRACK, OPEN_PATH, 24, {
      occupied: [{ x: spot.x, y: spot.y }],
    })
    expect(candidate).not.toBeNull()
    expect(candidate?.progress ?? 0).toBeLessThan(24)
  })
})

describe('stuck detector', () => {
  const sample = (x: number, y: number): StuckSample => ({ x, y, status: 'racing' })

  function run(
    detector: StuckDetector,
    seconds: number,
    positionAt: (time: number) => StuckSample,
  ): StuckEvent[] {
    const events: StuckEvent[] = []
    for (let time = 0; time <= seconds; time += 0.5) {
      events.push(...detector.update(time, [positionAt(time)]))
    }
    return events
  }

  it('flags a marble that stops making progress', () => {
    const detector = new StuckDetector({ path: OPEN_PATH })
    const events = run(detector, 30, () => sample(20, 40))

    const recoveries = events.filter((event) => event.kind === 'recover')
    expect(recoveries.length).toBeGreaterThanOrEqual(1)
  })

  it('leaves a marble that keeps moving alone', () => {
    const detector = new StuckDetector({ path: OPEN_PATH })
    // One unit per second along the line: three units per window, which is
    // well above the minimum progress the detector demands.
    const events = run(detector, 30, (time) => sample(20, 56 - time))

    expect(events.filter((event) => event.kind === 'recover')).toHaveLength(0)
    expect(events.filter((event) => event.kind === 'exhausted')).toHaveLength(0)
  })

  it('bounds the number of attempts and then reports the marble as spent', () => {
    const detector = new StuckDetector({ path: OPEN_PATH })
    const events = run(detector, 120, () => sample(20, 40))

    const recoveries = events.filter((event) => event.kind === 'recover')
    const exhausted = events.filter((event) => event.kind === 'exhausted')

    expect(recoveries).toHaveLength(MAX_RECOVERY_ATTEMPTS)
    expect(exhausted).toHaveLength(1)
    expect(detector.attemptsFor(0)).toBe(MAX_RECOVERY_ATTEMPTS)
  })

  it('waits for the cooldown before the next attempt', () => {
    const detector = new StuckDetector({ path: OPEN_PATH })

    const times: number[] = []
    let time = 0
    for (let step = 0; step <= 240; step += 1) {
      for (const event of detector.update(time, [sample(20, 40)])) {
        if (event.kind === 'recover') times.push(time)
      }
      time += 0.5
    }

    expect(times).toHaveLength(MAX_RECOVERY_ATTEMPTS)
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(RECOVERY_COOLDOWN_S)
    }
  })

  it('ignores marbles that are no longer racing', () => {
    const detector = new StuckDetector({ path: OPEN_PATH })
    const events = run(detector, 30, () => ({
      x: 20,
      y: 40,
      status: 'finished' as const,
    }))

    expect(events).toHaveLength(0)
    expect(detector.attemptsFor(0)).toBe(0)
  })

  it('needs a real amount of progress to count as moving', () => {
    // A marble creeping forward by far less than MIN_PROGRESS_D per window
    // is still stuck.
    const detector = new StuckDetector({ path: OPEN_PATH })
    const events = run(detector, 30, (time) =>
      sample(20, 40 - (time * MIN_PROGRESS_D * MARBLE_DIAMETER) / 60),
    )

    expect(events.filter((event) => event.kind === 'recover').length).toBeGreaterThanOrEqual(1)
  })
})
