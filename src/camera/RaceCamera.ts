import type { MarbleRuntime } from '../physics/MarbleRaceSimulation'
import type { TrackData } from '../track/track'

export interface CameraView {
  x: number
  y: number
  scale: number
}

/** The CSS-pixel size of the canvas the camera draws into. */
export interface Viewport {
  width: number
  height: number
}

export type CameraMode = 'ready' | 'follow' | 'final'

/**
 * Projects a world point onto the canvas.
 *
 * This is the single definition of the world-to-screen mapping: the renderer
 * builds the very same transform with `applyWorldTransform`, and every label,
 * marker and HUD anchor is placed with this function. Keeping one formula
 * guarantees that annotations can never drift away from the marbles they
 * belong to.
 */
export function projectToScreen(
  view: CameraView,
  viewport: Viewport,
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  return {
    x: (worldX - view.x) * view.scale + viewport.width / 2,
    y: viewport.height / 2 - (worldY - view.y) * view.scale,
  }
}

/** How much world the camera may show when fully zoomed out. */
const MAX_VISIBLE_WIDTH = 100
const MAX_VISIBLE_HEIGHT = 200
/** How little world the camera may show when fully zoomed in. */
const MIN_VISIBLE_WIDTH = 36
const MIN_VISIBLE_HEIGHT = 44
/** Absolute floor so marbles never shrink below a few pixels. */
const MIN_SCALE = 1.8
const FOLLOW_MARGIN_X = 6
const FOLLOW_MARGIN_TOP = 8
const FOLLOW_LOOK_AHEAD = 20
const FINAL_MARGIN = 10
const MIN_FOCUS_WIDTH = 16
const MIN_FOCUS_HEIGHT = 24
const TRACK_PADDING = 8
const POSITION_TIME_CONSTANT = 0.45
const ZOOM_IN_TIME_CONSTANT = 0.7
const ZOOM_OUT_TIME_CONSTANT = 0.3

interface FocusRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Smooth follow camera for the vertical track.
 *
 * It tracks the group of still-racing marbles, zooms out to frame their
 * spread (plus a look-ahead toward the upcoming course) and zooms back in
 * when the group bunches up. Position and zoom are smoothed over wall-clock
 * time so the view never jumps. The camera only reads marble positions — it
 * can never influence the physics simulation or finish order.
 */
export class RaceCamera {
  private track: TrackData
  private view: CameraView = { x: 0, y: 0, scale: 8 }
  private width = 0
  private height = 0
  private scaleMin = MIN_SCALE
  private scaleMax = 8

  constructor(track: TrackData) {
    this.track = track
    this.updateLimits()
  }

  getView(): CameraView {
    return { x: this.view.x, y: this.view.y, scale: this.view.scale }
  }

  /** The canvas size the camera is currently framed for. */
  get viewport(): Viewport {
    return { width: this.width, height: this.height }
  }

  /** Zoom above which individual marble name labels are worth drawing. */
  get labelThreshold(): number {
    return this.scaleMax * 0.85
  }

  /**
   * Swaps the track the camera follows.
   *
   * The viewport (and therefore the zoom and the framing) is kept: replacing
   * the camera instance would drop the canvas size and leave the camera
   * unsized, which renders the track tiny and throws every label off the
   * canvas. The new track only changes where the start view sits.
   */
  setTrack(track: TrackData): void {
    this.track = track
    this.snapToStart()
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
    this.updateLimits()
    if (width <= 0 || height <= 0) return
    if (!Number.isFinite(this.view.x) || !Number.isFinite(this.view.y)) {
      this.snapToStart()
      return
    }
    this.view.scale = clamp(this.view.scale, this.scaleMin, this.scaleMax)
  }

  reset(): void {
    this.snapToStart()
  }

  /** Snaps to the starting-grid view (mount, reset, and the Ready state). */
  snapToStart(): void {
    const focus = this.readyFocus()
    this.view = {
      x: (focus.minX + focus.maxX) / 2,
      y: (focus.minY + focus.maxY) / 2,
      scale: clamp(this.fitScale(focus), this.scaleMin, this.scaleMax),
    }
  }

  update(
    dtSeconds: number,
    mode: CameraMode,
    marbles: readonly MarbleRuntime[],
    simSpeed: number,
  ): void {
    if (this.width <= 0 || this.height <= 0) return

    const focus =
      mode === 'ready' ? this.readyFocus() : this.focusFromMarbles(marbles, mode)

    const targetScale = clamp(this.fitScale(focus), this.scaleMin, this.scaleMax)
    const targetX = (focus.minX + focus.maxX) / 2
    const targetY = (focus.minY + focus.maxY) / 2

    // Smoothing runs on wall-clock time scaled by the simulation speed, so the
    // camera keeps a consistent visual lag at any speed setting.
    const dtEff = Math.max(dtSeconds, 0) * clamp(simSpeed, 0.1, 4)

    const zoomTau = targetScale < this.view.scale ? ZOOM_OUT_TIME_CONSTANT : ZOOM_IN_TIME_CONSTANT
    const zoomStep = 1 - Math.exp(-dtEff / zoomTau)
    this.view.scale += (targetScale - this.view.scale) * zoomStep
    this.view.scale = clamp(this.view.scale, this.scaleMin, this.scaleMax)

    const positionStep = 1 - Math.exp(-dtEff / POSITION_TIME_CONSTANT)
    this.view.x += (targetX - this.view.x) * positionStep
    this.view.y += (targetY - this.view.y) * positionStep

    // Soft leash: keep the focus rectangle inside the viewport even while the
    // exponential smoothing is still catching up with a fast-moving group.
    const visibleWidth = this.width / this.view.scale
    const visibleHeight = this.height / this.view.scale
    this.view.x = this.leash(this.view.x, focus.minX, focus.maxX, visibleWidth)
    this.view.y = this.leash(this.view.y, focus.minY, focus.maxY, visibleHeight)

    if (
      !Number.isFinite(this.view.x) ||
      !Number.isFinite(this.view.y) ||
      !Number.isFinite(this.view.scale)
    ) {
      this.snapToStart()
    }
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return projectToScreen(this.view, this.viewport, worldX, worldY)
  }

  /** Screen pixels per world unit — used for hairline widths in the renderer. */
  get unit(): number {
    return this.view.scale
  }

  private leash(value: number, min: number, max: number, visible: number): number {
    const low = max - visible / 2
    const high = min + visible / 2
    if (low > high) return (min + max) / 2
    return clamp(value, low, high)
  }

  private updateLimits(): void {
    const width = Math.max(this.width, 1)
    const height = Math.max(this.height, 1)
    this.scaleMax = Math.max(
      MIN_SCALE,
      Math.min(width / MIN_VISIBLE_WIDTH, height / MIN_VISIBLE_HEIGHT),
    )
    this.scaleMin = Math.min(
      this.scaleMax,
      Math.max(MIN_SCALE, width / MAX_VISIBLE_WIDTH, height / MAX_VISIBLE_HEIGHT),
    )
  }

  private fitScale(focus: FocusRect): number {
    const focusWidth = Math.max(focus.maxX - focus.minX, 1)
    const focusHeight = Math.max(focus.maxY - focus.minY, 1)
    return Math.min(this.width / focusWidth, this.height / focusHeight)
  }

  private readyFocus(): FocusRect {
    const zone = this.track.startZone
    return {
      minX: zone.minX - FOLLOW_MARGIN_X,
      maxX: zone.maxX + FOLLOW_MARGIN_X,
      minY: zone.minY - FOLLOW_LOOK_AHEAD,
      maxY: zone.maxY + FOLLOW_MARGIN_TOP,
    }
  }

  private focusFromMarbles(
    marbles: readonly MarbleRuntime[],
    mode: CameraMode,
  ): FocusRect {
    if (marbles.length === 0) return this.readyFocus()

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const marble of marbles) {
      minX = Math.min(minX, marble.renderX)
      maxX = Math.max(maxX, marble.renderX)
      minY = Math.min(minY, marble.renderY)
      maxY = Math.max(maxY, marble.renderY)
    }

    const lookAhead = mode === 'final' ? FINAL_MARGIN : FOLLOW_LOOK_AHEAD
    const marginTop = mode === 'final' ? FINAL_MARGIN : FOLLOW_MARGIN_TOP

    // Marbles race downward, so the lowest marble leads. Frame the leader
    // (with look-ahead) and extend upward to include as many chasers as the
    // most zoomed-out level can still show — far-behind stragglers drop out
    // of frame instead of shrinking the whole view into unreadable dots.
    const maxFocusHeight = this.height / this.scaleMin - 4
    let focusMaxY = maxY + marginTop
    if (focusMaxY - (minY - lookAhead) > maxFocusHeight) {
      focusMaxY = minY - lookAhead + Math.max(maxFocusHeight, MIN_FOCUS_HEIGHT)
    }
    const focusMinY = minY - lookAhead

    const width = Math.max(maxX - minX + FOLLOW_MARGIN_X * 2, MIN_FOCUS_WIDTH)
    const height = Math.max(focusMaxY - focusMinY, MIN_FOCUS_HEIGHT)

    const centerX = this.trackClamp((minX + maxX) / 2, width, this.track.width)
    const centerY = this.trackClamp(
      (focusMinY + focusMaxY) / 2,
      height,
      this.track.height,
    )

    return {
      minX: centerX - width / 2,
      maxX: centerX + width / 2,
      minY: centerY - height / 2,
      maxY: centerY + height / 2,
    }
  }

  /** Keeps a focus rect of the given size inside generous track bounds. */
  private trackClamp(center: number, size: number, trackSize: number): number {
    const minCenter = -TRACK_PADDING + size / 2
    const maxCenter = trackSize + TRACK_PADDING - size / 2
    if (minCenter > maxCenter) return trackSize / 2
    return clamp(center, minCenter, maxCenter)
  }
}
