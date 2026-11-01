import { describe, expect, it } from 'vitest'
import { FIXED_TIME_STEP, MARBLE_DIAMETER } from '../config'
import { MARBLES } from '../data'
import { MarbleRaceSimulation } from '../physics/MarbleRaceSimulation'
import { CenterlinePath } from '../race/progress'
import { pickRecoveryCandidate, RecoveryManager } from '../race/recovery'
import { buildTrack, startPositionsFor } from './generate'
import { diamondCorners, pointDiamondDistance, pointRectDistance, rotatePoint } from './geometry'
import { validateTrack } from './validate'

const D = MARBLE_DIAMETER
const track = () => buildTrack('ironhallow', 1)

describe('Ironhallow sections', () => {
  it('keeps the spec sections and is harder than the spec', () => {
    const t = track()
    expect(t.obstacles.spinners.length).toBeGreaterThanOrEqual(9)
    expect(t.obstacles.diamonds.length).toBeGreaterThanOrEqual(3)
    expect(t.obstacles.pegs.length).toBeGreaterThanOrEqual(11)
    expect(t.obstacles.bars.filter((bar) => bar.role === 'deflector').length).toBeGreaterThanOrEqual(2)

    const teethRows = new Map<number, number>()
    for (const tooth of t.obstacles.teeth) {
      const key = Math.round(tooth.cy * 10) / 10
      teethRows.set(key, (teethRows.get(key) ?? 0) + 1)
    }
    expect(teethRows.size).toBeGreaterThanOrEqual(3)
    for (const count of teethRows.values()) expect(count).toBe(7)

    const rowOne = t.obstacles.spinners.filter((spinner) => spinner.cy === 82)
    const rowTwo = t.obstacles.spinners.filter((spinner) => spinner.cy === 75.5)
    expect(rowOne).toHaveLength(5)
    expect(rowTwo).toHaveLength(4)
  })

  it('has a 12-wide, 24-tall start channel and a 5.5-wide exit', () => {
    const t = buildTrack('ironhallow', 1, 20)
    expect(t.startZone.maxX - t.startZone.minX).toBe(12)
    expect(t.startZone.maxY - t.startLineY).toBe(24)
    expect(t.finishLine.sensor.halfW * 2).toBeGreaterThanOrEqual(5.5)
    expect(t.startPositions).toHaveLength(20)
    expect(startPositionsFor(20, 'ironhallow')).toEqual(t.startPositions)
  })

  it('leaves no spinner with a partial wall gap', () => {
    const t = track()
    for (const spinner of t.obstacles.spinners) {
      const swept = Math.hypot(spinner.halfW, spinner.halfH)
      for (const wall of t.walls) {
        const gap = pointRectDistance(spinner.cx, spinner.cy, wall) - swept
        expect(gap <= 0.3 || gap >= D).toBe(true)
      }
    }
  })

  it('validates every seed', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const report = validateTrack(buildTrack('ironhallow', seed))
      expect(report.violations).toEqual([])
    }
  })
})

describe('Ironhallow spinners', () => {
  it('never moves a spinner when the seed changes', () => {
    const positions = (seed: number) =>
      buildTrack('ironhallow', seed).obstacles.spinners.map((s) => [s.cx, s.cy])
    const baseline = positions(1)
    for (const seed of [2, 3, 42, 999]) expect(positions(seed)).toEqual(baseline)
  })

  it('gives the same seed the same phases and different seeds different phases', () => {
    const phases = (seed: number) =>
      buildTrack('ironhallow', seed).obstacles.spinners.map((s) => s.angleDeg)
    expect(phases(7)).toEqual(phases(7))
    expect(phases(7)).not.toEqual(phases(8))
  })

  it('alternates neighbours and keeps speeds in 1.0..2.2 rad/s', () => {
    const t = track()
    for (let i = 0; i < t.obstacles.spinners.length; i += 1) {
      const speed = Math.abs(t.obstacles.spinners[i].angularVelocity)
      expect(speed).toBeGreaterThanOrEqual(1.0)
      expect(speed).toBeLessThanOrEqual(2.2)
      if (i > 0) {
        expect(
          Math.sign(t.obstacles.spinners[i].angularVelocity),
        ).toBe(-Math.sign(t.obstacles.spinners[i - 1].angularVelocity))
      }
    }
  })

  it('restores the authored angles on Reset and advances them while racing', () => {
    const t = track()
    const defs = MARBLES.slice(0, 10).map((marble) => ({ id: marble.id }))
    const sim = new MarbleRaceSimulation(defs, t)
    const fresh = sim.spinnerAngles()
    sim.advanceSteps(600)
    expect(sim.spinnerAngles()).not.toEqual(fresh)
    sim.reset(defs)
    sim.spinnerAngles().forEach((angle, index) => {
      expect(angle).toBeCloseTo(fresh[index], 10)
    })
  })

  it('never places a recovery candidate inside a spinner sweep plus 1.5D', () => {
    const t = track()
    const path = new CenterlinePath(t.centerline)
    for (let progress = 0; progress <= path.length; progress += 1) {
      const candidate = pickRecoveryCandidate(t, path, progress)
      if (!candidate) continue
      for (const spinner of t.obstacles.spinners) {
        const swept = Math.hypot(spinner.halfW, spinner.halfH)
        expect(
          Math.hypot(candidate.x - spinner.cx, candidate.y - spinner.cy),
        ).toBeGreaterThanOrEqual(swept + 1.5 * D)
      }
    }
  })
})

describe('Ironhallow solids', () => {
  it('never lets a marble centre enter a solid obstacle', () => {
    const counts = [2, 10, 20]
    for (let seed = 1; seed <= 10; seed += 1) {
      for (const count of counts) {
        const t = buildTrack('ironhallow', seed, count)
        const defs = MARBLES.slice(0, count).map((marble) => ({ id: marble.id }))
        const sim = new MarbleRaceSimulation(defs, t)
        const steps = Math.ceil(60 / FIXED_TIME_STEP)
        for (let step = 0; step < steps && !sim.isCompleted(); step += 1) {
          sim.step(FIXED_TIME_STEP)
          const angles = sim.spinnerAngles()
          for (const marble of sim.marbles) {
            for (const bar of t.obstacles.bars) {
              if (pointRectDistance(marble.x, marble.y, bar) < -0.001) {
                throw new Error(`marble ${marble.id} inside a deflector bar`)
              }
            }
            for (const tooth of t.obstacles.teeth) {
              if (pointRectDistance(marble.x, marble.y, tooth) < -0.001) {
                throw new Error(`marble ${marble.id} inside a tooth`)
              }
            }
            for (const peg of t.obstacles.pegs) {
              if (
                Math.hypot(marble.x - peg.cx, marble.y - peg.cy) <
                peg.radius - 0.001
              ) {
                throw new Error(`marble ${marble.id} inside a peg`)
              }
            }
            for (const diamond of t.obstacles.diamonds) {
              if (pointDiamondDistance(marble.x, marble.y, diamond) < -0.001) {
                throw new Error(`marble ${marble.id} inside an island`)
              }
            }
            for (let i = 0; i < t.obstacles.spinners.length; i += 1) {
              const spinner = t.obstacles.spinners[i]
              const local = rotatePoint(
                marble.x - spinner.cx,
                marble.y - spinner.cy,
                (-angles[i] * 180) / Math.PI,
              )
              const inside =
                Math.abs(local.x) <= spinner.halfW - 0.001 &&
                Math.abs(local.y) <= spinner.halfH - 0.001
              if (inside) throw new Error(`marble ${marble.id} inside a spinner`)
            }
          }
        }
      }
    }
  }, 240_000)

  it('draws every island as a real diamond polygon', () => {
    for (const island of track().obstacles.diamonds) {
      expect(diamondCorners(island)).toHaveLength(4)
    }
  })
})

describe('Ironhallow matrix: 10 seeds x counts 2/10/20', () => {
  it('reports finish times, recoveries and DNFs', () => {
    const counts = [2, 10, 20]
    const results: { count: number; min: number; max: number; finishCount: number }[] = []
    for (const count of counts) {
      const times: number[] = []
      let recoveries = 0
      let dnfs = 0
      let unfinished = 0
      for (let seed = 1; seed <= 10; seed += 1) {
        const t = buildTrack('ironhallow', seed, count)
        const defs = MARBLES.slice(0, count).map((marble) => ({ id: marble.id }))
        const sim = new MarbleRaceSimulation(defs, t)
        const recovery = new RecoveryManager(t)
        recovery.onRecover = () => {
          recoveries += 1
        }
        const steps = Math.ceil(90 / FIXED_TIME_STEP)
        for (let step = 0; step < steps && !sim.isCompleted(); step += 1) {
          sim.step(FIXED_TIME_STEP)
          recovery.update(sim)
        }
        const states = sim.marbleStates()
        const finished = states.filter((state) => state.finished)
        for (const state of finished) times.push(state.finishTime ?? 0)
        dnfs += sim.dnfCount()
        unfinished += states.filter((state) => !state.finished && !state.dnf).length
      }
      const min = times.length > 0 ? Math.min(...times) : 0
      const max = times.length > 0 ? Math.max(...times) : 0
      console.log(
        `[ironhallow] ${count} marbles: ${times.length}/${10 * count} finishers, ` +
          `finish-time range ${min.toFixed(2)}..${max.toFixed(2)}s, ` +
          `${recoveries} recoveries, ${dnfs} DNF, ${unfinished} unfinished at 90s`,
      )
      results.push({ count, min, max, finishCount: times.length })
    }
    for (const result of results) {
      expect(result.finishCount).toBeGreaterThan(0)
      expect(result.min).toBeGreaterThanOrEqual(22)
      expect(result.max).toBeLessThanOrEqual(50)
    }
  }, 240_000)
})
