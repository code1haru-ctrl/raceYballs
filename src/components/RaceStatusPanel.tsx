import { Play, RotateCcw } from 'lucide-react'
import type { Track } from '../data'
import { formatElapsed, formatSpeed } from '../race/format'
import type { RaceSnapshot } from '../race/types'
import { Panel } from './Panel'

interface RaceStatusPanelProps {
  track: Track
  snapshot: RaceSnapshot
  onStart: () => void
  onReset: () => void
}

function headlineFor(snapshot: RaceSnapshot): string {
  switch (snapshot.state) {
    case 'Ready':
      return 'READY TO RACE'
    case 'Running':
      return 'RACING'
    case 'Completed':
      return 'RACE COMPLETE'
  }
}

function detailFor(snapshot: RaceSnapshot): string {
  switch (snapshot.state) {
    case 'Ready':
      return 'Grid staged · physics paused until start'
    case 'Running':
      return `${snapshot.finishedCount} of 10 finished · ${formatElapsed(snapshot.elapsedSec)} elapsed`
    case 'Completed':
      return `${snapshot.finishedCount} finished · ${snapshot.unfinishedCount} unfinished · results below`
  }
}

export function RaceStatusPanel({
  track,
  snapshot,
  onStart,
  onReset,
}: RaceStatusPanelProps) {
  return (
    <Panel
      eyebrow="Control deck"
      title="Race status"
      action={<span className="badge badge--cyan">Phase 3A</span>}
    >
      <div className="flex items-center gap-3">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <p className="font-display text-2xl font-semibold tracking-tight text-ink">
            {headlineFor(snapshot)}
          </p>
          <p className="mt-0.5 text-xs text-dim">{detailFor(snapshot)}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="stat">
          <dt>Track</dt>
          <dd>{track.name}</dd>
        </div>
        <div className="stat">
          <dt>Field</dt>
          <dd>10 marbles</dd>
        </div>
        <div className="stat">
          <dt>Speed</dt>
          <dd>{formatSpeed(snapshot.speed)}</dd>
        </div>
        <div className="stat">
          <dt>Elapsed</dt>
          <dd>{formatElapsed(snapshot.elapsedSec)}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onStart}
        disabled={snapshot.state !== 'Ready'}
        className="btn-primary mt-4 w-full py-3"
        title={
          snapshot.state === 'Ready'
            ? 'Release the marbles'
            : 'The race has already started'
        }
      >
        <Play className="size-4" aria-hidden="true" />
        Start Race
      </button>

      <button
        type="button"
        onClick={onReset}
        className="btn-secondary mt-2 w-full py-2.5 text-xs"
        title="Reset every marble to the grid and clear the results"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Reset Race
      </button>

      <p className="mt-2.5 text-[0.68rem] leading-relaxed text-dim">
        Finish order is recorded from real finish-line crossings in the
        physics simulation. Reset is safe to use repeatedly — it rebuilds the
        world and never leaves a second race running.
      </p>
    </Panel>
  )
}
