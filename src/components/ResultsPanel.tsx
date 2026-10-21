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
  if (standing.status === 'unfinished') return 'UNFINISHED'
  return 'RACING'
}

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
  const pending = snapshot.standings.filter(
    (standing) => standing.status !== 'finished',
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
              {pending.length} marble{pending.length === 1 ? '' : 's'} still
              racing · times are simulated seconds
            </p>
          )}

          {snapshot.state === 'Completed' && pending.length > 0 && (
            <div className="mt-3 border-t border-edge/50 pt-3">
              <p className="eyebrow">Unfinished</p>
              <ul className="mt-2 space-y-1.5">
                {pending.map((standing) => (
                  <li
                    key={standing.id}
                    className="flex items-center gap-3 rounded-xl border border-edge/50 bg-void/30 p-2.5 opacity-80"
                  >
                    <span className="w-6 shrink-0 text-center font-mono text-[0.62rem] text-dim">
                      —
                    </span>
                    <MarbleDot standing={standing} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-mist">
                      {standing.name}
                    </span>
                    <span className="font-mono text-[0.62rem] tracking-widest text-dim uppercase">
                      {statusLabel(standing)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.68rem] leading-relaxed text-dim">
                Unfinished marbles never crossed the line within the temporary
                safety limit, so no position is invented for them.
              </p>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
