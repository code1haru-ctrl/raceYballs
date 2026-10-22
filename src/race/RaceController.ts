import { RaceCamera, type CameraMode } from '../camera/RaceCamera'
import { FIXED_TIME_STEP } from '../config'
import { MARBLES, type Marble, type TrackId } from '../data'
import {
  MarbleRaceSimulation,
  type MarbleDefinition,
  type MarbleRuntime,
} from '../physics/MarbleRaceSimulation'
import { drawRace } from '../render/raceRenderer'
import { buildTrack, DEFAULT_SEEDS } from '../track/generate'
import type { TrackData } from '../track/track'
import { formatSpeed } from './format'
import { RecoveryManager } from './recovery'
import type { FinishRecord, MarbleStanding, RaceSnapshot, RaceState } from './types'

export const MIN_SPEED = 0.5
export const MAX_SPEED = 3
export const SPEED_STEP = 0.25
export const DEFAULT_SPEED = 1

/** Longest wall-clock delta accepted from rAF (also pauses races in hidden tabs). */
const MAX_FRAME_DELTA = 0.1
/** Catch-up budget: drops excess backlog after long hitches instead of spiralling. */
const MAX_STEPS_PER_FRAME = 12

const MARBLE_DEFINITIONS: MarbleDefinition[] = MARBLES.map((marble) => ({
  id: marble.id,
}))
const MARBLE_BY_ID = new Map<string, Marble>(MARBLES.map((marble) => [marble.id, marble]))

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Owns the whole race loop: the physics simulation, the camera, the rAF
 * render loop, the speed setting and the UI snapshot.
 *
 * React only ever reads the cached snapshot through `useSyncExternalStore`;
 * per-frame work never triggers a React render.
 */
export class RaceController {
  private sim: MarbleRaceSimulation
  private camera: RaceCamera
  private recovery: RecoveryManager
  private listeners = new Set<() => void>()
  private snapshot: RaceSnapshot
  private state: RaceState = 'Ready'
  private speed = DEFAULT_SPEED
  private accumulator = 0
  private rafId: number | null = null
  private lastFrameTime = 0
  private lastPublishedSecond = -1
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private layout = { width: 0, height: 0, dpr: 1 }
  private accent = '#2ce9ff'
  private trackId: TrackId = 'neon-circuit'
  private seed = DEFAULT_SEEDS['neon-circuit']

  constructor() {
    this.sim = new MarbleRaceSimulation(
      MARBLE_DEFINITIONS,
      buildTrack(this.trackId, this.seed),
    )
    this.camera = new RaceCamera(this.sim.track)
    this.recovery = new RecoveryManager(this.sim.track)
    this.wireCallbacks()
    this.snapshot = this.buildSnapshot()
  }

  /**
   * Connects the simulation and the recovery manager to the controller.
   *
   * Recovery runs on the same clock as the physics: every frame the stuck
   * detector samples the marbles that are still racing and asks the
   * simulation to move the ones that got stuck onto a safe spot of the
   * racing line. A marble that runs out of attempts becomes a DNF.
   */
  private wireCallbacks(): void {
    this.sim.onFinish = () => this.publish()
    this.sim.onDnf = () => this.publish()
    this.sim.onComplete = () => {
      this.state = 'Completed'
      this.accumulator = 0
      this.publish()
    }
    this.recovery.onRecover = () => this.publish()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): RaceSnapshot => this.snapshot

  /** Visual-only accent taken from the selected track concept. */
  setAccent = (accent: string): void => {
    this.accent = accent
  }

  setSpeed = (value: number): void => {
    const snapped =
      Math.round(clamp(value, MIN_SPEED, MAX_SPEED) / SPEED_STEP) * SPEED_STEP
    const next = clamp(Number(snapped.toFixed(2)), MIN_SPEED, MAX_SPEED)
    if (next === this.speed) return
    this.speed = next
    this.publish()
  }

  /**
   * Loads a track layout generated from `(trackId, seed)`.
   *
   * Only allowed while the race is Ready — a running race is never rebuilt
   * underneath the marbles. Changing the seed varies the interior obstacles
   * only; walls, start zone, finish line and centerline are fixed per track.
   */
  setTrack = (trackId: TrackId, seed: number): void => {
    if (this.state === 'Running') return
    this.trackId = trackId
    this.seed = seed
    const track: TrackData = buildTrack(trackId, seed)
    this.sim = new MarbleRaceSimulation(MARBLE_DEFINITIONS, track)
    this.recovery = new RecoveryManager(this.sim.track)
    this.wireCallbacks()
    // The camera keeps its viewport across a track change. Replacing the
    // camera instance would leave it unsized (0 x 0): the zoom would collapse
    // to the minimum, the track would shrink into the middle of the canvas
    // and every label would be projected off the left edge.
    this.camera.setTrack(track)
    this.syncSize()
    this.state = 'Ready'
    this.accumulator = 0
    this.lastPublishedSecond = -1
    this.publish()
  }

  /** Starts the simulation exactly once, and only from the Ready state. */
  start = (): void => {
    if (this.state !== 'Ready') return
    this.state = 'Running'
    this.accumulator = 0
    this.lastPublishedSecond = 0
    this.lastFrameTime = performance.now()
    this.publish()
  }

  /** Stops the race, rebuilds the physics world and restores the start view. */
  reset = (): void => {
    this.sim.reset(MARBLE_DEFINITIONS)
    this.recovery.reset()
    this.state = 'Ready'
    this.accumulator = 0
    this.lastPublishedSecond = -1
    this.camera.reset()
    this.publish()
  }

  attach = (canvas: HTMLCanvasElement): void => {
    this.detach()
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.syncSize()
    this.lastFrameTime = performance.now()
    this.rafId = requestAnimationFrame(this.frame)
  }

  detach = (): void => {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    this.canvas = null
    this.ctx = null
  }

  /** Re-reads the canvas box (resize / device-pixel-ratio changes). */
  syncSize = (): void => {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    const width = Math.max(0, Math.round(rect.width))
    const height = Math.max(0, Math.round(rect.height))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.round(width * dpr)
    const pixelHeight = Math.round(height * dpr)
    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
    }
    this.layout = { width, height, dpr }
    this.camera.resize(width, height)
  }

  /** Stops the loop and releases listeners. Safe to call more than once. */
  dispose = (): void => {
    this.detach()
    this.listeners.clear()
  }

  private readonly frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame)
    if (!this.canvas || !this.ctx) return

    const dtReal = clamp((now - this.lastFrameTime) / 1000, 0, MAX_FRAME_DELTA)
    this.lastFrameTime = now

    if (this.state === 'Running') {
      const budget = MAX_STEPS_PER_FRAME * FIXED_TIME_STEP
      this.accumulator = Math.min(this.accumulator + dtReal * this.speed, budget)
      let steps = 0
      while (this.accumulator >= FIXED_TIME_STEP && steps < MAX_STEPS_PER_FRAME) {
        this.sim.step(FIXED_TIME_STEP)
        this.accumulator -= FIXED_TIME_STEP
        steps += 1
        if (this.state !== 'Running') break
      }

      // Stuck detection and recovery run on the simulated clock, right after
      // the physics of this frame.
      if (this.state === 'Running') this.recovery.update(this.sim)
    }

    const alpha =
      this.state === 'Running'
        ? clamp(this.accumulator / FIXED_TIME_STEP, 0, 1)
        : 0
    this.sim.updateRenderPositions(alpha)

    let mode: CameraMode
    let focus: MarbleRuntime[]
    if (this.state === 'Ready') {
      mode = 'ready'
      focus = []
    } else if (this.state === 'Running') {
      const active = this.sim.activeMarbles()
      mode = active.length > 0 ? 'follow' : 'final'
      focus = active.length > 0 ? active : this.sim.marbles
    } else {
      mode = 'final'
      focus = this.sim.marbles
    }
    this.camera.update(dtReal, mode, focus, this.speed)

    drawRace(this.ctx, this.sim, this.camera, this.layout, {
      accent: this.accent,
    }, {
      state: this.state,
      elapsedSec: this.sim.elapsed(),
      finishedCount: this.sim.finishedCount(),
      dnfCount: this.sim.dnfCount(),
      speedLabel: formatSpeed(this.speed),
    })

    if (this.state === 'Running') {
      const second = Math.floor(this.sim.elapsed())
      if (second !== this.lastPublishedSecond) {
        this.lastPublishedSecond = second
        this.publish()
      }
    }
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  private buildSnapshot(): RaceSnapshot {
    const results: FinishRecord[] = []
    const standings: MarbleStanding[] = []

    for (const marble of this.sim.marbles) {
      const definition = MARBLE_BY_ID.get(marble.id)
      standings.push({
        id: marble.id,
        name: definition?.name ?? marble.id,
        color: definition?.color ?? '#e6ebf7',
        status: marble.status,
        place: marble.place,
        timeSec: marble.timeSec,
      })
      if (marble.place !== null) {
        results.push({
          place: marble.place,
          marbleId: marble.id,
          timeSec: marble.timeSec ?? 0,
        })
      }
    }

    results.sort((a, b) => a.place - b.place)
    standings.sort((a, b) => {
      if (a.status === 'finished' && b.status === 'finished') {
        return (a.place ?? 0) - (b.place ?? 0)
      }
      if (a.status === 'finished') return -1
      if (b.status === 'finished') return 1
      return 0
    })

    return {
      state: this.state,
      speed: this.speed,
      elapsedSec: this.sim.elapsed(),
      finishedCount: this.sim.finishedCount(),
      dnfCount: this.sim.dnfCount(),
      trackId: this.trackId,
      seed: this.seed,
      results,
      standings,
    }
  }
}
