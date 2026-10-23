import type {
  HistoryDnf,
  MarbleSnapshot,
  RaceHistoryEntry,
} from './types'

export type { HistoryDnf, MarbleSnapshot, RaceHistoryEntry }

/** The name and color of a marble, as it was during a recorded race. */
export type HistoryMarble = MarbleSnapshot

/** The history never grows past this many completed races. */
export const MAX_HISTORY_ENTRIES = 20

/**
 * In-memory history of the last completed races.
 *
 * The history lives only in this object: a page reload clears it, and
 * nothing is written to localStorage, IndexedDB or any other store.
 */
export class RaceHistory {
  private entries: RaceHistoryEntry[] = []

  /**
   * Adds a completed race as the newest entry.
   *
   * The entry id doubles as a duplicate guard: adding the same id twice is
   * a no-op, so a race can never be recorded twice. The entry is copied on
   * the way in, so later edits of the caller's arrays cannot rewrite a race
   * that is already in the history.
   */
  add(entry: RaceHistoryEntry): void {
    if (this.entries.some((existing) => existing.id === entry.id)) return
    this.entries = [copyEntry(entry), ...this.entries].slice(0, MAX_HISTORY_ENTRIES)
  }

  /** The recorded races, newest first. */
  getAll(): RaceHistoryEntry[] {
    return this.entries.map((entry) => copyEntry(entry))
  }

  /** Number of recorded races. */
  get size(): number {
    return this.entries.length
  }

  clear(): void {
    this.entries = []
  }
}

/** Deep copy of a history entry, so the history owns its own data. */
function copyEntry(entry: RaceHistoryEntry): RaceHistoryEntry {
  return {
    ...entry,
    results: entry.results.map((result) => ({ ...result })),
    dnfList: entry.dnfList.map((dnf) => ({ ...dnf })),
    marbleSnapshots: entry.marbleSnapshots.map((marble) => ({ ...marble })),
  }
}
