import { describe, expect, it } from 'vitest'
import { MAX_HISTORY_ENTRIES, RaceHistory } from './history'
import type { RaceHistoryEntry } from './types'

function makeEntry(id: string, overrides: Partial<RaceHistoryEntry> = {}): RaceHistoryEntry {
  return {
    id,
    trackId: 'neon-circuit',
    trackName: 'Neon Circuit',
    seed: 1234,
    results: [{ place: 1, marbleId: 'cyan-comet', timeSec: 4.2 }],
    dnfList: [],
    duration: 12.5,
    marbleSnapshots: [
      { id: 'cyan-comet', name: 'Cyan Comet', color: '#2ce9ff' },
      { id: 'magenta-mirage', name: 'Magenta Mirage', color: '#ff3fbf' },
    ],
    ...overrides,
  }
}

describe('race history', () => {
  it('keeps the newest race first', () => {
    const history = new RaceHistory()
    history.add(makeEntry('race-1'))
    history.add(makeEntry('race-2'))
    history.add(makeEntry('race-3'))

    expect(history.getAll().map((entry) => entry.id)).toEqual([
      'race-3',
      'race-2',
      'race-1',
    ])
  })

  it('never grows past twenty races and drops the oldest ones', () => {
    const history = new RaceHistory()
    for (let index = 0; index < MAX_HISTORY_ENTRIES + 5; index += 1) {
      history.add(makeEntry(`race-${index}`))
    }

    const entries = history.getAll()
    expect(entries).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(history.size).toBe(MAX_HISTORY_ENTRIES)
    // The newest race is first, the oldest one that still fits is last.
    expect(entries[0].id).toBe(`race-${MAX_HISTORY_ENTRIES + 4}`)
    expect(entries[entries.length - 1].id).toBe('race-5')
  })

  it('records a race only once', () => {
    const history = new RaceHistory()
    history.add(makeEntry('race-1'))
    history.add(makeEntry('race-1'))

    expect(history.getAll()).toHaveLength(1)
  })

  it('keeps the marble names and colors frozen at the moment of the race', () => {
    const history = new RaceHistory()
    const snapshots = [
      { id: 'cyan-comet', name: 'Cyan Comet', color: '#2ce9ff' },
    ]
    history.add(makeEntry('race-1', { marbleSnapshots: snapshots }))

    // A later edit of the very same array must not rewrite the recorded race.
    snapshots[0].name = 'Renamed Later'
    snapshots[0].color = '#000000'
    snapshots.push({ id: 'ghost', name: 'Ghost', color: '#ffffff' })

    const entry = history.getAll()[0]
    expect(entry.marbleSnapshots).toHaveLength(1)
    expect(entry.marbleSnapshots[0].name).toBe('Cyan Comet')
    expect(entry.marbleSnapshots[0].color).toBe('#2ce9ff')
  })

  it('hands out copies, so the history cannot be edited from the outside', () => {
    const history = new RaceHistory()
    history.add(makeEntry('race-1'))

    const entry = history.getAll()[0]
    entry.marbleSnapshots[0].name = 'Tampered'
    entry.results[0].place = 99

    const fresh = history.getAll()[0]
    expect(fresh.marbleSnapshots[0].name).toBe('Cyan Comet')
    expect(fresh.results[0].place).toBe(1)
  })

  it('stores the race facts the results panel reads', () => {
    const history = new RaceHistory()
    history.add(
      makeEntry('race-1', {
        duration: 42.25,
        dnfList: [{ marbleId: 'chrome-ghost', reason: 'recovery-failed', attempts: 3 }],
      }),
    )

    const entry = history.getAll()[0]
    expect(entry.duration).toBe(42.25)
    expect(entry.dnfList).toEqual([
      { marbleId: 'chrome-ghost', reason: 'recovery-failed', attempts: 3 },
    ])
    expect(entry.results[0].marbleId).toBe('cyan-comet')
  })
})
