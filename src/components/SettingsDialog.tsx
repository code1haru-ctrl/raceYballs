import { useEffect } from 'react'
import { AudioLines, MonitorCog, Settings, ShieldCheck, X } from 'lucide-react'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

const SETTINGS_GROUPS = [
  {
    icon: AudioLines,
    title: 'Sound & music',
    detail: 'Master volume, meme SFX, and mute behavior.',
    accent: 'text-neon-cyan',
  },
  {
    icon: MonitorCog,
    title: 'Visuals',
    detail: 'Marble effects, camera motion, and glow intensity.',
    accent: 'text-neon-magenta',
  },
  {
    icon: ShieldCheck,
    title: 'Race rules',
    detail: 'Track seeds, stuck-marble recovery, and race length.',
    accent: 'text-neon-purple',
  },
]

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div
        className="modal-backdrop absolute inset-0 bg-void/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="modal-panel panel relative w-full max-w-md overflow-hidden p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Game options</p>
            <h2
              id="settings-title"
              className="mt-1 flex items-center gap-2 font-display text-xl font-semibold text-ink"
            >
              <Settings
                className="size-5 text-neon-cyan"
                aria-hidden="true"
              />
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn size-9"
            aria-label="Close settings"
            autoFocus
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-dim">
          Configuration will open up as races, audio, and customization are
          added. Nothing here changes gameplay yet.
        </p>

        <ul className="mt-4 space-y-2">
          {SETTINGS_GROUPS.map((group) => (
            <li
              key={group.title}
              className="flex items-start gap-3 rounded-xl border border-edge/60 bg-void/40 p-3"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-edge/70 bg-panel-raised/70">
                <group.icon
                  className={`size-4 ${group.accent}`}
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">
                    {group.title}
                  </span>
                  <span className="badge">Planned</span>
                </span>
                <span className="mt-0.5 block text-[0.68rem] leading-relaxed text-dim">
                  {group.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-center text-[0.62rem] tracking-wide text-dim">
          Coming in a later phase.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="btn-secondary mt-3 w-full py-2.5 text-xs"
        >
          Back to the arena
        </button>
      </div>
    </div>
  )
}
