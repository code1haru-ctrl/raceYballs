import { useEffect, useState, useSyncExternalStore } from 'react'
import { ControlsPanel } from './components/ControlsPanel'
import { Header } from './components/Header'
import { MarbleGarage } from './components/MarbleGarage'
import { RaceArena } from './components/RaceArena'
import { RaceStatusPanel } from './components/RaceStatusPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { SettingsDialog } from './components/SettingsDialog'
import { TrackSelector } from './components/TrackSelector'
import { TRACKS, type TrackId } from './data'
import { RaceController } from './race/RaceController'
import { DEFAULT_SEEDS } from './track/generate'
import { pickFreshSeed } from './track/seed'

function App() {
  const [selectedTrackId, setSelectedTrackId] = useState<TrackId>('neon-circuit')
  const [seed, setSeed] = useState<number>(DEFAULT_SEEDS['neon-circuit'])
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [controller] = useState(() => new RaceController())

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  )

  useEffect(() => {
    return () => controller.dispose()
  }, [controller])

  const selectedTrack =
    TRACKS.find((track) => track.id === selectedTrackId) ?? TRACKS[0]

  const handleSelectTrack = (id: TrackId) => {
    setSelectedTrackId(id)
    setSeed(DEFAULT_SEEDS[id])
    controller.setTrack(id, DEFAULT_SEEDS[id])
  }

  const handleNewVariation = () => {
    const next = pickFreshSeed()
    setSeed(next)
    controller.setTrack(selectedTrackId, next)
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="app-grid" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <Header onOpenSettings={() => setSettingsOpen(true)} />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
            <div className="min-w-0">
              <RaceArena
                track={selectedTrack}
                controller={controller}
                snapshot={snapshot}
              />
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1">
              <RaceStatusPanel
                track={selectedTrack}
                snapshot={snapshot}
                onStart={controller.start}
                onReset={controller.reset}
              />
              <TrackSelector
                selectedId={selectedTrackId}
                onSelect={handleSelectTrack}
                seed={seed}
                onNewVariation={handleNewVariation}
                disabled={snapshot.state === 'Running'}
              />
              <div className="md:col-span-2 xl:col-span-1">
                <ControlsPanel
                  speed={snapshot.speed}
                  onSpeedChange={controller.setSpeed}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <MarbleGarage />
            <ResultsPanel snapshot={snapshot} />
          </div>
        </main>

        <footer className="mx-auto flex w-full max-w-7xl flex-col gap-1.5 px-4 pb-6 text-[0.62rem] text-dim sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="font-mono tracking-[0.18em] uppercase">
            raceYballs · Phase 3A track generation
          </p>
          <p className="flex items-center gap-2">
            <span
              className="inline-block size-1.5 rounded-full bg-neon-cyan/70"
              aria-hidden="true"
            />
            Seeded track layouts · Planck.js simulation · Canvas 2D
          </p>
        </footer>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

export default App
