import { Circle, History, Trophy } from 'lucide-react'
import type { CSSProperties } from 'react'
import { formatElapsed } from '../race/format'
import type { MarbleStanding, RaceSnapshot } from '../race/types'
import { Panel } from './Panel'

interface ResultsPanelProps {
  snapshot: RaceSnapshot
}

function statusLabel(standing: MarbleStanding): string {
  if (standing.status === 'finished') return `P${standing.place}`
  if (standing.status === 'dnf') return 'DNF'
  return 'RACING'
}
void statusLabel

function MarbleDot({ standing }: { standing: MarbleStanding }) {
  return (
    <span
      className="marble-swatch shrink-0"
      style={{ '--marble': standing.color } as CSSProperties}
      aria-hidden="true"
    />
  )
}

export function ResultsPanel({ snapshot }: ResultsPanelProps) {
  const showList = snapshot.state !== 'Ready'
  const finishers = snapshot.standings.filter(
    (standing) => standing.status === 'finished',
  )
  const racing = snapshot.standings.filter(
    (standing) => standing.status === 'racing',
  )
  const retired = snapshot.standings.filter(
    (standing) => standing.status === 'dnf',
  )

  return (
    <Panel
      eyebrow="Race log"
      title="Results & history"
      icon={<History className="size-4 text-neon-purple" aria-hidden="true" />}
      action={
        <span className="badge">
          {snapshot.state === 'Completed'
            ? 'Final'
            : snapshot.state === 'Running'
              ? 'Live'
              : 'Idle'}
        </span>
      }
    >
      {!showList ? (
        <div className="empty-state">
          <span className="flex size-11 items-center justify-center rounded-full border border-edge-bright/60 bg-panel-raised/80 text-neon-purple">
            <Trophy className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-1 font-display text-sm font-semibold text-ink">
            No races yet
          </p>
          <p className="max-w-xs text-[0.72rem] leading-relaxed text-dim">
            Press Start Race to release the marbles. Finishing order appears
            here the moment each marble crosses the line.
          </p>
        </div>
      ) : (
        <div>
          {finishers.length === 0 ? (
            <p className="rounded-xl border border-edge/60 bg-void/40 p-3 text-[0.72rem] leading-relaxed text-dim">
              No marble has reached the finish line yet.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {finishers.map((standing) => (
                <li
                  key={standing.id}
                  className="flex items-center gap-3 rounded-xl border border-edge/60 bg-void/40 p-2.5"
                >
                  <span className="w-6 shrink-0 text-center font-mono text-xs font-bold text-neon-cyan">
                    {standing.place}
                  </span>
                  <MarbleDot standing={standing} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                    {standing.name}
                  </span>
                  <span className="font-mono text-[0.68rem] text-mist">
                    {standing.timeSec !== null
                      ? formatElapsed(standing.timeSec)
                      : '—'}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {snapshot.state === 'Running' && (
            <p className="mt-3 flex items-center gap-2 text-[0.68rem] leading-relaxed text-dim">
              <Circle className="size-2.5 fill-neon-cyan text-neon-cyan" aria-hidden="true" />
              {racing.length} marble{racing.length === 1 ? '' : 's'} still
              racing · times are simulated seconds
            </p>
          )}

          {retired.length > 0 && (
            <div className="mt-3 border-t border-edge/50 pt-3">
              <p className="eyebrow">DNF</p>
              <ul className="mt-2 space-y-1.5">
                {retired.map((standing) => (
                  <li
                    key={standing.id}
                    className="flex items-center gap-3 rounded-xl border border-edge/50 bg-void/30 p-2.5 opacity-80"
                  >
                    <span className="w-6 shrink-0 text-center font-mono text-[0.62rem] text-dim">
                      -
                    </span>
                    <MarbleDot standing={standing} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-mist">
                      {standing.name}
                    </span>
                    <span className="font-mono text-[0.62rem] tracking-widest text-dim uppercase">
                      DNF
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.68rem] leading-relaxed text-dim">
                DNF marbles never crossed the line: recovery ran out of
                attempts, or the race hit its time limit. No position is
                invented for them.
              </p>
            </div>
          )}

          <div className="mt-4 border-t border-edge/50 pt-3">
            <p className="eyebrow">History (last 20)</p>
            {(!snapshot.history || snapshot.history.length === 0) ? (
              <p className="mt-2 text-[0.68rem] text-dim">No races yet</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {snapshot.history.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-edge/50 bg-void/30 p-2">
                    <div className="flex justify-between text-[0.68rem] text-dim">
                      <span>{entry.trackName} (seed {entry.seed})</span>
                      <span>{entry.duration.toFixed(1)}s</span>
                    </div>
                    <div className="mt-1 text-[0.68rem] text-mist">
                      {entry.results && entry.results.length > 0 ? (
                        <div>
                          {entry.results.slice(0, 3).map((r) => {
                            const snap = entry.marbleSnapshots.find((m) => m.id === r.marbleId)
                            return (
                              <span key={r.marbleId} className="mr-2">
                                P{r.place} {snap?.name ?? r.marbleId}
                              </span>
                            )
                          })}
                        </div>
                      ) : null}
                      {entry.dnfList && entry.dnfList.length > 0 && (
                        <div className="mt-1 text-[0.62rem] text-dim">
                          DNF: {entry.dnfList.map((d) => {
                            const snap = entry.marbleSnapshots.find((m) => m.id === d.marbleId)
                            return snap?.name ?? d.marbleId
                          }).join(', ')}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
