import { describe, expect, it } from 'vitest'
import { OvertakeDetector, type OvertakeSample } from './overtakes'

function rank(
  entries: [string, number, OvertakeSample['status']?][],
): OvertakeSample[] {
  return entries.map(([id, progress, status]) => ({
    id,
    progress,
    status: status ?? 'racing',
  }))
}

describe('overtake detection', () => {
  it('triggers once when a real swap holds for the hold time', () => {
    const detector = new OvertakeDetector({ minMargin: 1, holdMs: 200 })

    expect(detector.update(rank([['a', 10], ['b', 5]]), 0)).toEqual([])

    expect(detector.update(rank([['a', 5], ['b', 10]]), 100)).toEqual([])
    expect(detector.update(rank([['a', 5], ['b', 10]]), 299)).toEqual([])

    const swaps = detector.update(rank([['a', 5], ['b', 10]]), 300)
    expect(swaps).toHaveLength(1)
    expect(swaps[0]).toMatchObject({
      overtakerId: 'b',
      overtakenId: 'a',
    })
    expect(swaps[0].margin).toBeCloseTo(5)

    expect(detector.update(rank([['a', 5], ['b', 10]]), 400)).toEqual([])
  })

  it('ignores a swap whose progress gap is below the margin', () => {
    const detector = new OvertakeDetector({ minMargin: 2, holdMs: 100 })

    detector.update(rank([['a', 10], ['b', 9.9]]), 0)
    detector.update(rank([['a', 9.9], ['b', 10]]), 50)

    expect(detector.update(rank([['a', 9.9], ['b', 10]]), 500)).toEqual([])
  })

  it('does not trigger before the hold time has elapsed', () => {
    const detector = new OvertakeDetector({ minMargin: 1, holdMs: 500 })

    detector.update(rank([['a', 10], ['b', 5]]), 0)
    detector.update(rank([['a', 5], ['b', 10]]), 100)

    expect(detector.update(rank([['a', 5], ['b', 10]]), 599)).toEqual([])
    expect(detector.update(rank([['a', 5], ['b', 10]]), 600)).toHaveLength(1)
  })

  it('cancels a pending swap when the order returns to the baseline', () => {
    const detector = new OvertakeDetector({ minMargin: 1, holdMs: 100 })

    detector.update(rank([['a', 10], ['b', 5]]), 0)
    detector.update(rank([['a', 5], ['b', 10]]), 50)
    expect(detector.update(rank([['a', 10], ['b', 5]]), 90)).toEqual([])

    detector.update(rank([['a', 5], ['b', 10]]), 120)
    expect(detector.update(rank([['a', 5], ['b', 10]]), 210)).toEqual([])
    expect(detector.update(rank([['a', 5], ['b', 10]]), 220)).toHaveLength(1)
  })

  it('ignores finished and DNF marbles completely', () => {
    const detector = new OvertakeDetector({ minMargin: 1, holdMs: 100 })

    detector.update(
      rank([
        ['a', 10, 'racing'],
        ['b', 5, 'racing'],
        ['done', 30, 'finished'],
        ['out', 20, 'dnf'],
      ]),
      0,
    )

    detector.update(
      rank([
        ['a', 5, 'racing'],
        ['b', 10, 'racing'],
        ['done', 50, 'finished'],
        ['out', 40, 'dnf'],
      ]),
      50,
    )

    const swaps = detector.update(
      rank([
        ['a', 5, 'racing'],
        ['b', 10, 'racing'],
        ['done', 60, 'finished'],
        ['out', 55, 'dnf'],
      ]),
      200,
    )

    expect(swaps).toHaveLength(1)
    expect(swaps[0].overtakerId).toBe('b')
    expect(swaps[0].overtakenId).toBe('a')
  })

  it('treats a marble leaving the active set as a new baseline', () => {
    const detector = new OvertakeDetector({ minMargin: 1, holdMs: 100 })

    detector.update(rank([['a', 10], ['b', 5]]), 0)
    // `a` finishes; `b` becomes the leader. That is not an overtake.
    detector.update(rank([['a', 10, 'finished'], ['b', 5]]), 50)
    expect(detector.update(rank([['a', 10, 'finished'], ['b', 5]]), 500)).toEqual(
      [],
    )
  })
})
