import { describe, expect, it } from 'vitest'
import { CenterlinePath } from './progress'

/** An L-shaped line: 10 units down, then 10 units right. */
const PATH = new CenterlinePath([
  { x: 0, y: 10 },
  { x: 0, y: 0 },
  { x: 10, y: 0 },
])

describe('centerline progress', () => {
  it('measures the total length of the line', () => {
    expect(PATH.length).toBeCloseTo(20, 6)
  })

  it('reports 0 at the start and the full length at the end', () => {
    expect(PATH.progressAt(0, 10)).toBeCloseTo(0, 6)
    expect(PATH.progressAt(10, 0)).toBeCloseTo(20, 6)
  })

  it('projects a point beside the line onto the line', () => {
    // Five units to the right of the vertical leg: the closest point on the
    // line is (0, 7), which is 3 units from the start.
    expect(PATH.progressAt(5, 7)).toBeCloseTo(3, 6)
  })

  it('clamps points before the start and past the end', () => {
    expect(PATH.progressAt(0, 14)).toBeCloseTo(0, 6)
    expect(PATH.progressAt(20, 0)).toBeCloseTo(20, 6)
  })

  it('turns a progress value back into a world point', () => {
    const point = PATH.pointAt(3)
    expect(point.x).toBeCloseTo(0, 6)
    expect(point.y).toBeCloseTo(7, 6)
    expect(PATH.progressAt(point.x, point.y)).toBeCloseTo(3, 6)
  })

  it('keeps the progress of a straight line proportional to the distance', () => {
    const straight = new CenterlinePath([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
    ])
    expect(straight.length).toBeCloseTo(40, 6)
    expect(straight.progressAt(0, 25)).toBeCloseTo(25, 6)
    expect(straight.progressAt(7, 25)).toBeCloseTo(25, 6)
  })

  it('never reports a negative progress', () => {
    expect(PATH.progressAt(-50, -50)).toBeGreaterThanOrEqual(0)
    expect(PATH.progressAt(0, -50)).toBeGreaterThanOrEqual(0)
  })
})
