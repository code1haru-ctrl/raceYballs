import { type CSSProperties, useMemo } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { TRACKS, type TrackId } from '../data'
import { buildTrack, DEFAULT_SEEDS } from '../track/generate'
import type { TrackData } from '../track/track'
import { Panel } from './Panel'

interface TrackSelectorProps {
  selectedId: TrackId
  onSelect: (id: TrackId) => void
  seed: number
  onNewVariation: () => void
  disabled: boolean
}

/** Straight-line distance between two points. */
function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

/**
 * Draws a miniature of a track's fixed frame (walls + centerline) into a
 * viewBox. Both the walls and the centerline are seed-independent, so the
 * preview shows the *structure* of the concept rather than one variation.
 */
function TrackPreview({ track, accent }: { track: TrackData; accent: string }) {
  const width = track.width
  const height = track.height
  const linePath = track.centerline
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${height - point.y}`)
    .join(' ')

  return (
    <svg
      viewBox={`-3 -3 ${width + 6} ${height + 6}`}
      className="track-preview"
      role="img"
      aria-label={`${track.name} layout preview`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="rgba(8, 11, 20, 0.7)"
        stroke={accent}
        strokeOpacity={0.35}
        strokeWidth={0.6}
      />
      {track.walls.map((wall, index) => (
        <rect
          key={index}
          x={wall.cx - wall.halfW}
          y={height - (wall.cy + wall.halfH)}
          width={wall.halfW * 2}
          height={wall.halfH * 2}
          fill={accent}
          fillOpacity={0.22}
          stroke={accent}
          strokeOpacity={0.5}
          strokeWidth={0.4}
        />
      ))}
      <path
        d={linePath}
        fill="none"
        stroke={accent}
        strokeOpacity={0.8}
        strokeWidth={0.9}
        strokeDasharray="2 2.4"
        strokeLinecap="round"
      />
      {track.startPositions.map((slot, index) => (
        <circle
          key={`s${index}`}
          cx={slot.x}
          cy={height - slot.y}
          r={0.9}
          fill={accent}
          fillOpacity={0.7}
        />
      ))}
      <rect
        x={0}
        y={height - track.finishLine.zone.maxY}
        width={width}
        height={track.finishLine.zone.maxY - track.finishLine.zone.minY}
        fill="#e9edf8"
        fillOpacity={0.25}
      />
    </svg>
  )
}

/** Rough structural signature so each concept's preview reads differently. */
function densityLabel(track: TrackData): string {
  const length = track.centerline.reduce((total, point, index) => {
    if (index === 0) return 0
    const previous = track.centerline[index - 1]
    return total + distance(previous.x, previous.y, point.x, point.y)
  }, 0)
  const gates = track.centerline.length
  return `${gates} gates · ${Math.round(length)}u run`
}

export function TrackSelector({
  selectedId,
  onSelect,
  seed,
  onNewVariation,
  disabled,
}: TrackSelectorProps) {
  const previews = useMemo(
    () =>
      Object.fromEntries(
        TRACKS.map((track) => [
          track.id,
          buildTrack(track.id, DEFAULT_SEEDS[track.id]),
        ]),
      ) as Record<TrackId, TrackData>,
    [],
  )

  return (
    <Panel
      eyebrow="Track select"
      title="Choose your line"
      action={<span className="badge">3 layouts</span>}
    >
      <div role="group" aria-label="Track selection" className="space-y-2">
        {TRACKS.map((track, index) => {
          const selected = track.id === selectedId

          return (
            <button
              key={track.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelect(track.id)}
              className="track-option"
              style={{ '--track-accent': track.accent } as CSSProperties}
            >
              <span className="track-thumb" aria-hidden="true">
                <TrackPreview track={previews[track.id]} accent={track.accent} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[0.55rem] tracking-[0.2em] text-dim">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate font-display text-sm font-semibold text-ink">
                    {track.name}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[0.68rem] text-dim">
                  {track.tagline}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[0.58rem] tracking-[0.14em] text-dim/80">
                  {densityLabel(previews[track.id])}
                </span>
              </span>
              {selected ? (
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: track.accent,
                    color: track.accent,
                    backgroundColor: `${track.accent}1a`,
                  }}
                  aria-hidden="true"
                >
                  <Check className="size-3" />
                </span>
              ) : (
                <span className="badge shrink-0">Layout</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-edge/60 bg-void/40 px-3 py-2">
        <span className="min-w-0">
          <span className="block font-mono text-[0.55rem] tracking-[0.2em] text-dim uppercase">
            Seed
          </span>
          <span className="block truncate font-mono text-xs text-ink">
            {seed}
          </span>
        </span>
        <button
          type="button"
          onClick={onNewVariation}
          disabled={disabled}
          className="btn-secondary shrink-0 px-3 py-2 text-[0.68rem]"
          title={
            disabled
              ? 'Reset the race before generating a new variation'
              : 'Generate a new seeded variation of the fixed track frame'
          }
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          New Variation
        </button>
      </div>

      <p className="mt-3 text-[0.68rem] leading-relaxed text-dim">
        Each concept is a structurally distinct 40&nbsp;&times;&nbsp;146 frame. A
        seed only reshuffles the interior obstacles — walls, start grid, finish
        line and centerline stay fixed. Track changes are only applied while the
        race is Ready.
      </p>
    </Panel>
  )
}
