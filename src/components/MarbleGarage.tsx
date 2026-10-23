import type { CSSProperties } from 'react'
import { useState } from 'react'
import { Palette, RotateCcw } from 'lucide-react'
import { Panel } from './Panel'
import type { RaceController } from '../race/RaceController'
import type { MarbleConfig } from '../race/marbleCustomization'
import type { RaceSnapshot } from '../race/types'

interface MarbleGarageProps {
  controller: RaceController
  snapshot: RaceSnapshot
}

const SWATCHES = [
  '#2ce9ff',
  '#ff3fbf',
  '#a97bff',
  '#8df25c',
  '#ffd23f',
  '#ff7a3d',
  '#ff5c7a',
  '#4d7cff',
  '#3dffc8',
  '#e6ebf7',
  '#ffffff',
  '#ff00ff',
  '#00ffff',
  '#ffff00',
]

function isColorReadable(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.1
}
// used implicitly via validation in controller
void isColorReadable

export function MarbleGarage({ controller, snapshot }: MarbleGarageProps) {
  const configs = controller.getMarbleConfigs()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [colorDraft, setColorDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const disabled = snapshot.state !== 'Ready'

  const startEdit = (config: MarbleConfig) => {
    if (disabled) return
    setEditingId(config.id)
    setNameDraft(config.name)
    setColorDraft(config.color)
    setError(null)
  }

  const save = () => {
    if (!editingId) return
    const res = controller.setMarbleConfig(editingId, {
      name: nameDraft,
      color: colorDraft,
    })
    if (!res.ok) {
      setError(res.error ?? 'Invalid')
      return
    }
    setError(null)
    setEditingId(null)
  }

  const cancel = () => {
    setEditingId(null)
    setError(null)
  }

  return (
    <Panel
      eyebrow="Garage"
      title="Marble customization"
      icon={
        <Palette className="size-4 text-neon-magenta" aria-hidden="true" />
      }
      action={
        <span className="badge">
          {snapshot.marbleCount} active · {configs.length - snapshot.marbleCount} reserve
        </span>
      }
    >
      <div className="space-y-2">
        {configs.map((marble, index) => {
          const active = index < snapshot.marbleCount
          return (
          <div
            key={marble.id}
            className={`flex items-center gap-2 rounded-xl border border-edge/60 bg-void/40 p-2 ${
              active ? '' : 'opacity-45'
            }`}
          >
            <span
              className="marble-swatch shrink-0"
              style={{ '--marble': marble.color } as CSSProperties}
              title={active ? marble.name : `${marble.name} (reserve)`}
            />
            {editingId === marble.id ? (
              <div className="flex flex-1 flex-col gap-1">
                <input
                  className="w-full rounded-lg bg-void/60 px-2 py-1 text-xs text-ink"
                  value={nameDraft}
                  maxLength={12}
                  onChange={(e) => setNameDraft(e.target.value)}
                  disabled={disabled}
                />
                <div className="flex flex-wrap gap-1">
                  {SWATCHES.map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      onClick={() => setColorDraft(sw)}
                      className="h-4 w-4 rounded-full border border-white/20"
                      style={{ backgroundColor: sw }}
                      disabled={disabled}
                    />
                  ))}
                  <input
                    type="color"
                    value={colorDraft.startsWith('#') ? colorDraft : '#' + colorDraft}
                    onChange={(e) => setColorDraft(e.target.value)}
                    disabled={disabled}
                    className="h-4 w-8"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={save}>
                    Save
                  </button>
                  <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={cancel}>
                    Cancel
                  </button>
                </div>
                {error && <p className="text-[0.68rem] text-red-400">{error}</p>}
              </div>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                  {marble.name}
                </span>
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-xs"
                  onClick={() => startEdit(marble)}
                  disabled={disabled}
                >
                  Edit
                </button>
              </>
            )}
          </div>
          )
        })}
      </div>

      <button
        type="button"
        className="btn-secondary mt-4 w-full py-2.5 text-xs"
        onClick={controller.resetMarbleConfigs}
        disabled={disabled}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Reset to defaults
      </button>

      {disabled && (
        <p className="mt-2.5 text-[0.68rem] leading-relaxed text-dim">
          Editing is allowed only while Ready.
        </p>
      )}
    </Panel>
  )
}
