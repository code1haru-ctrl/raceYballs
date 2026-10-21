import type { CSSProperties } from 'react'
import { Paintbrush, Palette } from 'lucide-react'
import { MARBLES } from '../data'
import { Panel } from './Panel'

export function MarbleGarage() {
  return (
    <Panel
      eyebrow="Garage"
      title="Marble customization"
      icon={
        <Palette className="size-4 text-neon-magenta" aria-hidden="true" />
      }
      action={<span className="badge">10 marbles</span>}
    >
      <div className="flex flex-wrap gap-2" aria-hidden="true">
        {MARBLES.map((marble) => (
          <span
            key={marble.id}
            className="marble-swatch"
            style={{ '--marble': marble.color } as CSSProperties}
            title={marble.name}
          />
        ))}
      </div>

      <button
        type="button"
        className="btn-secondary mt-4 w-full py-2.5 text-xs"
        disabled
        aria-describedby="garage-note"
        title="Marble customization is coming in a later phase"
      >
        <Paintbrush className="size-4" aria-hidden="true" />
        Open marble garage
        <span className="badge ml-auto">Later</span>
      </button>

      <p
        id="garage-note"
        className="mt-2.5 text-[0.68rem] leading-relaxed text-dim"
      >
        Skins, trails, and marble traits are coming in a later phase.
      </p>
    </Panel>
  )
}
