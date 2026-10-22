import { Settings } from 'lucide-react'

interface HeaderProps {
  onOpenSettings: () => void
}

export function Header({ onOpenSettings }: HeaderProps) {
  return (
    <header className="relative z-20 border-b border-edge/60 bg-void/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="logo-orbit" aria-hidden="true">
            <div className="logo-ball" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl leading-none font-semibold tracking-tight text-ink sm:text-[1.4rem]">
              race<span className="text-neon-cyan">Y</span>balls
            </h1>
            <p className="mt-1 hidden truncate font-mono text-[0.55rem] tracking-[0.28em] text-dim uppercase sm:block">
              Automatic marble racing
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="badge badge--cyan hidden md:inline-flex">
            PHASE 3B · RECOVERY
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="btn-secondary h-9 px-3 sm:h-10 sm:px-4"
            aria-haspopup="dialog"
            aria-label="Open settings"
          >
            <Settings className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  )
}
