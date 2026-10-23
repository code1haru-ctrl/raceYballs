import { Gauge, Lock, Volume2, VolumeX } from 'lucide-react'
import { formatSpeed } from '../race/format'
import { MAX_SPEED, MIN_SPEED, SPEED_STEP } from '../race/RaceController'
import { Panel } from './Panel'

interface ControlsPanelProps {
  speed: number
  onSpeedChange: (value: number) => void
  muted: boolean
  volume: number
  onToggleMute: () => void
  onVolumeChange: (value: number) => void
}

export function ControlsPanel({
  speed,
  onSpeedChange,
  muted,
  volume,
  onToggleMute,
  onVolumeChange,
}: ControlsPanelProps) {
  const fillPercent = ((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100

  return (
    <Panel
      eyebrow="Simulation"
      title="Race settings"
      action={<span className="badge badge--cyan">Live</span>}
    >
      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="sim-speed" className="field-label">
              <Gauge className="size-3.5 text-neon-cyan" aria-hidden="true" />
              Simulation speed
            </label>
            <span className="font-mono text-xs text-ink">
              {formatSpeed(speed)}
            </span>
          </div>
          <input
            id="sim-speed"
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={SPEED_STEP}
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            className="range mt-2.5"
            style={{
              background: `linear-gradient(90deg, var(--color-neon-cyan) 0%, var(--color-neon-purple) ${fillPercent}%, var(--color-edge) ${fillPercent}%, var(--color-edge) 100%)`,
            }}
            aria-describedby="controls-note"
          />
          <div className="mt-1 flex justify-between font-mono text-[0.55rem] tracking-widest text-dim">
            <span>{formatSpeed(MIN_SPEED)}</span>
            <span>{formatSpeed(MAX_SPEED)}</span>
          </div>
        </div>

        <div className="border-t border-edge/50 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="field-label">
              <Volume2
                className="size-3.5 text-neon-purple"
                aria-hidden="true"
              />
              Audio
            </span>
            <span className="font-mono text-[0.55rem] tracking-widest text-dim uppercase">
              Volume {Math.round(volume * 100)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleMute}
              className="icon-btn size-8 shrink-0"
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              aria-pressed={muted}
              title={muted ? 'Unmute audio' : 'Mute audio'}
            >
              {muted ? (
                <VolumeX className="size-4" aria-hidden="true" />
              ) : (
                <Volume2 className="size-4" aria-hidden="true" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(volume * 100)}
              onChange={(event) =>
                onVolumeChange(Number(event.target.value) / 100)
              }
              aria-label="Master volume"
              className="range"
            />
          </div>
        </div>

        <p
          id="controls-note"
          className="flex items-start gap-2 text-[0.68rem] leading-relaxed text-dim"
        >
          <Lock
            className="mt-0.5 size-3.5 shrink-0 text-neon-purple"
            aria-hidden="true"
          />
          Speed changes how fast simulated time advances, not the renderer.
          Physics always steps a fixed 1/60&nbsp;s (up to 12 catch-up steps per
          frame), so races stay stable at any speed.
        </p>
      </div>
    </Panel>
  )
}
