import { RaceCamera, type CameraMode } from '../camera/RaceCamera'
import { FIXED_TIME_STEP } from '../config'
import { MARBLES, type TrackId, TRACKS } from '../data'
import {
  MarbleRaceSimulation,
  type DnfReason,
  type MarbleDefinition,
  type MarbleRuntime,
} from '../physics/MarbleRaceSimulation'
import { drawRace } from '../render/raceRenderer'
import { buildTrack, DEFAULT_SEEDS } from '../track/generate'
import { pickFreshSeed } from '../track/seed'
import type { TrackData } from '../track/track'
import { formatSpeed } from './format'
import { RaceHistory } from './history'
import {
  MarbleCustomization,
  validateMarbleColor,
  validateMarbleName,
} from './marbleCustomization'
import { OvertakeDetector } from './overtakes'
import { CenterlinePath } from './progress'
import type {
  RaceEvent,
  RaceEventListener,
  RaceEventSource,
  SilenceReason,
} from './raceEvents'
import { RecoveryManager } from './recovery'
import type {
  FinishRecord,
  HistoryDnf,
  MarbleEditResult,
  MarbleSnapshot,
  MarbleStanding,
  RaceHistoryEntry,
  RaceSnapshot,
  RaceState,
} from './types'

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Why a marble left the race, and how many recovery attempts it had used. */
interface DnfDetail {
  reason: DnfReason
  attempts: number
}

/**
 * Owns the whole race loop: the physics simulation, the camera, the rAF
 * render loop, the speed setting and the UI snapshot.
 *
 * React only ever reads the cached snapshot through `useSyncExternalStore`;
 * per-frame work never triggers a React render.
 */
export class RaceController implements RaceEventSource {
  private sim: MarbleRaceSimulation
  private camera: RaceCamera
  private recovery: RecoveryManager
  private listeners = new Set<() => void>()
  private raceEventListeners = new Set<RaceEventListener>()
  private path: CenterlinePath
  private overtakes = new OvertakeDetector()
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

  /**
   * The customisation lives in its own store, completely apart from the
   * physics world and the track: a name or a color change never rebuilds
   * a simulation, it only changes what is drawn and what is reported.
   */
  private customization = new MarbleCustomization()
  /** The in-memory history of the last completed races. */
  private history = new RaceHistory()
  /** DNF details of the current race, keyed by marble id. */
  private dnfDetails = new Map<string, DnfDetail>()
  /** Serial number of the current race; bumped every time a race starts. */
  private raceSerial = 0
  /** Serial number of the race that was already written to the history. */
  private recordedSerial: number | null = null

  constructor() {
    this.sim = new MarbleRaceSimulation(
      MARBLE_DEFINITIONS,
      buildTrack(this.trackId, this.seed),
    )
    this.camera = new RaceCamera(this.sim.track)
    this.recovery = new RecoveryManager(this.sim.track)
    this.path = new CenterlinePath(this.sim.track.centerline)
    this.wireCallbacks()
    this.snapshot = this.buildSnapshot()
  }

  /** Subscribes to plain race events (collision, overtake, finish, silence). */
  subscribeRaceEvents = (listener: RaceEventListener): (() => void) => {
    this.raceEventListeners.add(listener)
    return () => {
      this.raceEventListeners.delete(listener)
    }
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
    this.sim.onFinish = (event) => {
      this.emitRaceEvent({
        type: 'finish',
        place: event.place,
        marbleId: event.marbleId,
        timeSec: event.timeSec,
      })
      this.publish()
    }
    this.sim.onCollision = (event) => {
      this.emitRaceEvent({
        type: 'collision',
        marbleId: event.marbleId,
        otherId: event.otherId,
        kind: event.kind,
        impact: event.impact,
      })
    }
    this.sim.onDnf = (event) => {
      const index = this.sim.marbles.findIndex(
        (marble) => marble.id === event.marbleId,
      )
      this.dnfDetails.set(event.marbleId, {
        reason: event.reason,
        attempts:
          index >= 0 ? this.recovery.detector.attemptsFor(index) : 0,
      })
      this.publish()
    }
    this.sim.onComplete = () => {
      this.state = 'Completed'
      this.accumulator = 0
      this.recordHistory()
      this.publish()
    }
    this.recovery.onRecover = () => {
      // A teleport changes the ranking without a real pass. Re-baseline the
      // overtake detector so the move itself is never heard.
      this.overtakes.reset()
      this.publish()
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): RaceSnapshot => this.snapshot

  /** The current marble customisation (names and colors). */
  getMarbleConfigs = () => this.customization.list()

  /**
   * Renames a marble.
   *
   * Only allowed while the race is Ready. An invalid name is rejected and
   * the last valid name is kept.
   */
  setMarbleName = (id: string, name: string): MarbleEditResult => {
    if (this.state !== 'Ready') {
      return { ok: false, error: 'Marbles can only be edited while Ready' }
    }
    const result = this.customization.setName(id, name)
    if (!result.valid) return { ok: false, error: result.error }
    this.publish()
    return { ok: true }
  }

  /**
   * Recolors a marble.
   *
   * Only allowed while the race is Ready. An invalid color is rejected and
   * the last valid color is kept.
   */
  setMarbleColor = (id: string, color: string): MarbleEditResult => {
    if (this.state !== 'Ready') {
      return { ok: false, error: 'Marbles can only be edited while Ready' }
    }
    const result = this.customization.setColor(id, color)
    if (!result.valid) return { ok: false, error: result.error }
    this.publish()
    return { ok: true }
  }

  /**
   * Applies a name and/or a color to one marble in a single edit.
   *
   * This is what the garage UI calls. The edit is all-or-nothing: both parts
   * are validated first, and a rejected part leaves the marble exactly as it
   * was. Like every other edit, it is only allowed while the race is Ready.
   */
  setMarbleConfig = (
    id: string,
    patch: { name?: string; color?: string },
  ): MarbleEditResult => {
    if (this.state !== 'Ready') {
      return { ok: false, error: 'Marbles can only be edited while Ready' }
    }
    if (!this.customization.get(id)) {
      return { ok: false, error: 'Unknown marble' }
    }

    const configs = this.customization.list()
    if (patch.name !== undefined) {
      const result = validateMarbleName(patch.name, configs, id)
      if (!result.valid) return { ok: false, error: result.error }
    }
    if (patch.color !== undefined) {
      const result = validateMarbleColor(patch.color, configs, id)
      if (!result.valid) return { ok: false, error: result.error }
    }

    if (patch.name !== undefined) this.customization.setName(id, patch.name)
    if (patch.color !== undefined) this.customization.setColor(id, patch.color)
    this.publish()
    return { ok: true }
  }

  /** Restores the default names and colors. Only allowed while Ready. */
  resetMarbleConfigs = (): void => {
    if (this.state !== 'Ready') return
    this.customization.resetToDefaults()
    this.publish()
  }

  /** The recorded races, newest first. */
  getHistory = (): RaceHistoryEntry[] => this.history.getAll()

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
    this.path = new CenterlinePath(track.centerline)
    this.overtakes.reset()
    this.state = 'Ready'
    this.accumulator = 0
    this.lastPublishedSecond = -1
    this.dnfDetails.clear()
    this.emitSilence('track-change')
    this.publish()
  }

  /** Starts the simulation exactly once, and only from the Ready state. */
  start = (): void => {
    if (this.state !== 'Ready') return
    this.state = 'Running'
    this.accumulator = 0
    this.lastPublishedSecond = 0
    this.lastFrameTime = performance.now()
    this.raceSerial += 1
    this.dnfDetails.clear()
    this.overtakes.reset()
    this.publish()
  }

  /**
   * Stops the race, rebuilds the physics world and restores the start view.
   *
   * The track, the seed, the marble names and the marble colors are all
   * kept: a reset is the same race, staged again.
   */
  reset = (): void => {
    this.sim.reset(MARBLE_DEFINITIONS)
    this.recovery.reset()
    this.state = 'Ready'
    this.accumulator = 0
    this.lastPublishedSecond = -1
    this.dnfDetails.clear()
    this.overtakes.reset()
    this.camera.reset()
    this.emitSilence('reset')
    this.publish()
  }

  /**
   * Races again on the same track with a brand new seed.
   *
   * The marble names and colors are kept, the world is rebuilt, the camera
   * is reset and the race returns to Ready. It never starts by itself and it
   * never starts a second simulation loop. The new seed is returned so the
   * UI can show the very seed the race is staged on.
   */
  raceAgain = (): number => {
    if (this.state !== 'Completed') return this.seed
    const nextSeed = this.pickSeedDifferentFromCurrent()
    this.seed = nextSeed
    const track: TrackData = buildTrack(this.trackId, nextSeed)
    this.sim = new MarbleRaceSimulation(MARBLE_DEFINITIONS, track)
    this.recovery = new RecoveryManager(this.sim.track)
    this.wireCallbacks()
    this.camera.setTrack(track)
    this.syncSize()
    this.path = new CenterlinePath(track.centerline)
    this.overtakes.reset()
    this.state = 'Ready'
    this.accumulator = 0
    this.lastPublishedSecond = -1
    this.dnfDetails.clear()
    this.camera.reset()
    this.emitSilence('race-again')
    this.publish()
    return nextSeed
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
    this.raceEventListeners.clear()
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
      if (this.state === 'Running') {
        this.recovery.update(this.sim)
        this.detectOvertakes(performance.now())
      }
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

    drawRace(
      this.ctx,
      this.sim,
      this.camera,
      this.layout,
      { accent: this.accent },
      {
        state: this.state,
        elapsedSec: this.sim.elapsed(),
        finishedCount: this.sim.finishedCount(),
        dnfCount: this.sim.dnfCount(),
        speedLabel: formatSpeed(this.speed),
      },
      this.customization.list(),
    )

    if (this.state === 'Running') {
      const second = Math.floor(this.sim.elapsed())
      if (second !== this.lastPublishedSecond) {
        this.lastPublishedSecond = second
        this.publish()
      }
    }
  }

  /**
   * Ranks the active marbles by centerline progress and emits the swaps that
   * pass the detector's margin and hold-time rules. Only the swap is emitted;
   * the audio layer decides whether it gets a sound (cooldown, mute, ...).
   */
  private detectOvertakes(nowMs: number): void {
    const samples = this.sim.marbles.map((marble) => ({
      id: marble.id,
      progress: this.path.progressAt(marble.x, marble.y),
      status: marble.status,
    }))

    for (const overtake of this.overtakes.update(samples, nowMs)) {
      this.emitRaceEvent({
        type: 'overtake',
        overtakerId: overtake.overtakerId,
        overtakenId: overtake.overtakenId,
        margin: overtake.margin,
      })
    }
  }

  private emitSilence(reason: SilenceReason): void {
    this.emitRaceEvent({ type: 'silence', reason })
  }

  private emitRaceEvent(event: RaceEvent): void {
    for (const listener of this.raceEventListeners) {
      try {
        listener(event)
      } catch {
        // Audio must never be able to break the race loop.
      }
    }
  }

  /**
   * Draws a seed that is guaranteed to be different from the current one.
   *
   * "Race Again" has to change the track layout, so it never reuses the seed
   * the finished race was staged on.
   */
  private pickSeedDifferentFromCurrent(): number {
    let seed = pickFreshSeed()
    while (seed === this.seed) seed = pickFreshSeed()
    return seed
  }

  /**
   * Writes the finished race into the in-memory history.
   *
   * Exactly one entry is written per completed race: the serial number of
   * the race guards against a second write, and the history itself rejects
   * an entry whose id it already knows.
   */
  private recordHistory(): void {
    if (this.state !== 'Completed') return
    if (this.recordedSerial === this.raceSerial) return

    const results: FinishRecord[] = []
    const dnfList: HistoryDnf[] = []

    for (const marble of this.sim.marbles) {
      if (marble.place !== null) {
        results.push({
          place: marble.place,
          marbleId: marble.id,
          timeSec: marble.timeSec ?? 0,
        })
        continue
      }
      if (marble.status === 'dnf') {
        const detail = this.dnfDetails.get(marble.id)
        dnfList.push({
          marbleId: marble.id,
          reason: detail?.reason ?? 'recovery-failed',
          attempts: detail?.attempts ?? 0,
        })
      }
    }

    results.sort((a, b) => a.place - b.place)

    // The names and colors are frozen here: a later edit of a marble must
    // never rewrite a race that is already in the history.
    const marbleSnapshots: MarbleSnapshot[] = this.customization.list()

    this.history.add({
      id: `race-${this.raceSerial}`,
      trackId: this.trackId,
      trackName: TRACKS.find((track) => track.id === this.trackId)?.name ?? this.trackId,
      seed: this.seed,
      results,
      dnfList,
      duration: this.sim.elapsed(),
      marbleSnapshots,
    })
    this.recordedSerial = this.raceSerial
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  private buildSnapshot(): RaceSnapshot {
    const results: FinishRecord[] = []
    const standings: MarbleStanding[] = []
    const configs = this.customization.list()

    for (const marble of this.sim.marbles) {
      const config = configs.find((entry) => entry.id === marble.id)
      const detail = this.dnfDetails.get(marble.id)
      standings.push({
        id: marble.id,
        name: config?.name ?? marble.id,
        color: config?.color ?? '#e6ebf7',
        status: marble.status,
        place: marble.place,
        timeSec: marble.timeSec,
        dnfReason: detail?.reason ?? null,
        recoveryAttempts: detail?.attempts ?? 0,
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
      /** Marbles that are out of the race without a finishing position. */
      dnfCount: this.sim.dnfCount(),
      /** Currently loaded track and the seed its layout was generated from. */
      trackId: this.trackId,
      trackName:
        TRACKS.find((track) => track.id === this.trackId)?.name ?? this.trackId,
      seed: this.seed,
      results,
      standings,
      /** The marble customisation currently in use. */
      marbles: configs,
      /** The last completed races, newest first. */
      history: this.history.getAll(),
    }
  }
}
