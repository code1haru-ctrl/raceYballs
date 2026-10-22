import { useEffect, useRef, type CSSProperties } from 'react'
import { Flag } from 'lucide-react'
import type { RaceController } from '../race/RaceController'
import type { RaceSnapshot } from '../race/types'
import type { Track } from '../data'

interface RaceArenaProps {
  track: Track
  controller: RaceController
  snapshot: RaceSnapshot
}

function statusLine(snapshot: RaceSnapshot): string {
  switch (snapshot.state) {
    case 'Ready':
      return 'Ten marbles are staged at the starting grid. The camera shows the start area and physics is paused.'
    case 'Running':
      return `Race in progress. ${snapshot.finishedCount} of 10 marbles have crossed the finish line.`
    case 'Completed':
      return `Race complete. ${snapshot.finishedCount} finished and ${snapshot.dnfCount} DNF.`
  }
}

export function RaceArena({ track, controller, snapshot }: RaceArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    controller.setAccent(track.accent)
  }, [controller, track.accent])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    controller.attach(canvas)
    const observer = new ResizeObserver(() => controller.syncSize())
    observer.observe(wrapper)

    return () => {
      observer.disconnect()
      controller.detach()
    }
  }, [controller])

  const badgeLabel =
    snapshot.state === 'Ready'
      ? '10 marbles · staged'
      : snapshot.state === 'Running'
        ? `racing · ${snapshot.finishedCount}/10 home`
        : `complete · ${snapshot.finishedCount}/10 home`

  return (
    <section aria-labelledby="arena-heading" className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Arena · Live simulation</p>
          <h2
            id="arena-heading"
            className="mt-1 flex flex-wrap items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink"
          >
            <Flag className="size-4 text-neon-cyan" aria-hidden="true" />
            <span>{track.name}</span>
            <span className="font-mono text-[0.6rem] font-normal tracking-[0.2em] text-dim uppercase">
              seed {snapshot.seed}
            </span>
          </h2>
        </div>
        <span className="badge">{badgeLabel}</span>
      </div>

      <div
        ref={wrapperRef}
        className="arena"
        style={{ '--arena-accent': track.accent } as CSSProperties}
      >
        <canvas
          ref={canvasRef}
          className="arena-canvas"
          role="img"
          aria-label={`Live marble race on ${track.name}. ${statusLine(snapshot)}`}
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {statusLine(snapshot)}
      </p>

      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-dim">
        <span>
          {track.tagline} Physics runs on Planck.js at a fixed 1/60&nbsp;s
          timestep; the view follows the racing group with a smoothed camera.
        </span>
      </p>
    </section>
  )
}
