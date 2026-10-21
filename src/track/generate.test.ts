import { describe, expect, it } from 'vitest'
import { FIXED_TIME_STEP } from '../config'
import { MARBLES, TRACKS, type TrackId } from '../data'
import { MarbleRaceSimulation } from '../physics/MarbleRaceSimulation'
import {
  buildTrack,
  centerlineFor,
  DEFAULT_SEEDS,
  fallbackTrack,
  MAX_ATTEMPTS,
  START_POSITIONS,
} from './generate'
import { validateTrack } from './validate'

const DEFS = MARBLES.map((marble) => ({ id: marble.id }))
const TRACK_IDS: TrackId[] = TRACKS.map((track) => track.id)
/** Finite window the headless matrix is judged against. */
const MATRIX_SECONDS = 60
const MATRIX_STEPS = Math.ceil(MATRIX_SECONDS / FIXED_TIME_STEP)

/** Serialises the parts of a track a seed is allowed to change. */
function obstacleSignature(trackId: TrackId, seed: number): string {
  const track = buildTrack(trackId, seed)
  return JSON.stringify({
    bars: track.obstacles.bars,
    pegs: track.obstacles.pegs,
  })
}

/** Serialises the parts of a track a seed must never change. */
function frameSignature(trackId: TrackId, seed: number): string {
  const track = buildTrack(trackId, seed)
  return JSON.stringify({
    width: track.width,
    height: track.height,
    bounds: track.bounds,
    walls: track.walls,
    startLineY: track.startLineY,
    startZone: track.startZone,
    startPositions: track.startPositions,
    finishLine: track.finishLine,
    centerline: track.centerline,
  })
}

describe('seeded track generation', () => {
  it('is deterministic: the same (track, seed) always builds the same layout', () => {
    for (const trackId of TRACK_IDS) {
      for (const seed of [1, 2, 12345, 4294967295]) {
        expect(obstacleSignature(trackId, seed)).toBe(
          obstacleSignature(trackId, seed),
        )
      }
    }
  })

  it('never moves the fixed frame when only the seed changes', () => {
    for (const trackId of TRACK_IDS) {
      const baseline = frameSignature(trackId, DEFAULT_SEEDS[trackId])
      for (const seed of [1, 2, 7, 42, 999, 4294967295]) {
        expect(frameSignature(trackId, seed)).toBe(baseline)
      }
    }
  })

  it('varies obstacles across at least two distinct seeds per track', () => {
    for (const trackId of TRACK_IDS) {
      const signatures = new Set(
        [1, 2, 3, 4, 5].map((seed) => obstacleSignature(trackId, seed)),
      )
      expect(signatures.size).toBeGreaterThan(1)
    }
  })

  it('keeps DEFAULT_SEEDS explicit per track', () => {
    for (const trackId of TRACK_IDS) {
      expect(Number.isInteger(DEFAULT_SEEDS[trackId])).toBe(true)
    }
  })

  it('accepts 200 consecutive seeds for every track', () => {
    for (const trackId of TRACK_IDS) {
      for (let seed = 1; seed <= 200; seed += 1) {
        const report = validateTrack(buildTrack(trackId, seed))
        if (!report.valid) {
          throw new Error(`${trackId} seed ${seed} invalid: ${report.violations.join('; ')}`)
        }
      }
    }
  })

  it('rejects a hand-broken layout', () => {
    const base = buildTrack('neon-circuit', 1)
    const broken = {
      ...base,
      obstacles: {
        bars: [...base.obstacles.bars, ...base.obstacles.bars],
        pegs: [
          ...base.obstacles.pegs,
          // Two pegs on top of each other.
          { cx: 20, cy: 90, radius: 2 },
          { cx: 20, cy: 90, radius: 2 },
        ],
      },
    }
    const report = validateTrack(broken)
    expect(report.valid).toBe(false)
    expect(report.violations.length).toBeGreaterThan(0)
  })

  it('rejects a start grid with overlapping marbles', () => {
    const base = buildTrack('neon-circuit', 1)
    const crowded = {
      ...base,
      startPositions: START_POSITIONS.map((slot, index) =>
        index === 0 ? { ...slot } : { ...slot, x: base.startPositions[0].x, y: base.startPositions[0].y },
      ),
    }
    const report = validateTrack(crowded)
    expect(report.valid).toBe(false)
  })

  it('returns a valid layout even at the last attempt index', () => {
    for (const trackId of TRACK_IDS) {
      const track = buildTrack(trackId, 1, MAX_ATTEMPTS - 1)
      expect(validateTrack(track).valid).toBe(true)
    }
  })

  it('the hand-built fallback layout is valid for every track', () => {
    for (const trackId of TRACK_IDS) {
      const report = validateTrack(fallbackTrack(trackId))
      expect(report.violations).toEqual([])
      expect(report.valid).toBe(true)
    }
  })

  it('exposes a centerline per track that runs from start to finish', () => {
    for (const trackId of TRACK_IDS) {
      const line = centerlineFor(trackId)
      expect(line.length).toBeGreaterThan(1)
      expect(line[0].y).toBeGreaterThan(line[line.length - 1].y)
    }
  })
})

describe('reset preserves the loaded layout', () => {
  it('rebuilds the same track and seed after reset', () => {
    for (const trackId of TRACK_IDS) {
      const track = buildTrack(trackId, 5)
      const sim = new MarbleRaceSimulation(DEFS, track)
      const before = sim.marbleStates()
      sim.advanceSteps(MATRIX_STEPS)
      sim.reset(DEFS)
      expect(sim.marbleStates()).toEqual(before)
      expect(sim.track.id).toBe(trackId)
      expect(sim.track.obstacles).toEqual(track.obstacles)
    }
  })
})

describe('headless matrix: 3 tracks x 10 seeds x 60s', () => {
  it('reports finishers and finish-time range per track', () => {
    for (const trackId of TRACK_IDS) {
      const times: number[] = []
      let finishers = 0
      for (let seed = 1; seed <= 10; seed += 1) {
        const sim = new MarbleRaceSimulation(DEFS, buildTrack(trackId, seed))
        sim.advanceSteps(MATRIX_STEPS)
        const finished = sim.marbleStates().filter((state) => state.finished)
        finishers += finished.length
        for (const state of finished) times.push(state.finishTime ?? 0)
      }
      const min = Math.min(...times)
      const max = Math.max(...times)
      const summary =
        `${trackId}: ${finishers}/100 finishers, ` +
        `finish-time range ${min.toFixed(2)}..${max.toFixed(2)}s`
      console.log(`[matrix] ${summary}`)
      expect(finishers).toBeGreaterThan(0)
      expect(min).toBeGreaterThan(0)
      expect(max).toBeLessThanOrEqual(MATRIX_SECONDS)
    }
  })
})
