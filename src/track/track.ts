/**
 * Track data for the Phase 2 vertical prototype.
 *
 * The track is pure data: bounds, walls, obstacles, the start zone with its
 * ten start positions, the finish line, and a centerline for later phases.
 * World creation in the physics module only reads this object — it never
 * hard-codes geometry of its own.
 *
 * The coordinate system is world-space and independent of the canvas:
 * +x to the right, +y up, origin at the bottom-left interior corner.
 * Interior playfield is [0, width] x [0, height].
 */

export interface TrackRect {
  cx: number
  cy: number
  halfW: number
  halfH: number
  angleDeg: number
}

export interface TrackCircle {
  cx: number
  cy: number
  radius: number
}

export interface TrackPoint {
  x: number
  y: number
}

export interface MarbleSlot {
  x: number
  y: number
}

export interface TrackBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Non-wall course furniture a marble can bounce off. */
export interface TrackObstacles {
  /** Angled deflector bars. */
  bars: TrackRect[]
  /** Round pegs. */
  pegs: TrackCircle[]
}

/** The line a marble must cross to be recorded as a finisher. */
export interface TrackFinishLine {
  /** World-space y of the line; marbles finish when they cross it downward. */
  y: number
  zone: TrackBounds
  /** Axis-aligned sensor band that spans the full interior width. */
  sensor: { cx: number; cy: number; halfW: number; halfH: number }
}

/** One track laid out as data, ready to be turned into a physics world. */
export interface TrackData {
  id: string
  name: string
  /** Interior width of the playfield, in physics units. */
  width: number
  /** Interior height of the playfield (floor to ceiling), in physics units. */
  height: number
  bounds: TrackBounds
  walls: TrackRect[]
  obstacles: TrackObstacles
  startLineY: number
  startZone: TrackBounds
  /** Exactly ten grid slots, ordered as the marbles are listed. */
  startPositions: MarbleSlot[]
  finishLine: TrackFinishLine
  /**
   * Advisory path from the start zone to the finish line through the course.
   * Unused in Phase 2; Phase 3 will follow it for camera work and analysis.
   */
  centerline: TrackPoint[]
}

/** Interior width of the prototype track, in physics units. */
export const TRACK_WIDTH = 40
/** Interior height of the prototype track, in physics units. */
export const TRACK_HEIGHT = 146
const WALL_THICKNESS = 6

/**
 * One vertical prototype layout:
 * staggered starting grid near the top, five angled deflector bars,
 * two center pegs, and a finish line above a small catch basin.
 */
export const PROTOTYPE_TRACK: TrackData = {
  id: 'prototype-vertical',
  name: 'Neon Circuit · Prototype',
  width: TRACK_WIDTH,
  height: TRACK_HEIGHT,
  bounds: { minX: 0, minY: 0, maxX: TRACK_WIDTH, maxY: TRACK_HEIGHT },
  walls: [
    {
      cx: -WALL_THICKNESS / 2,
      cy: TRACK_HEIGHT / 2,
      halfW: WALL_THICKNESS / 2,
      halfH: TRACK_HEIGHT / 2 + WALL_THICKNESS,
      angleDeg: 0,
    },
    {
      cx: TRACK_WIDTH + WALL_THICKNESS / 2,
      cy: TRACK_HEIGHT / 2,
      halfW: WALL_THICKNESS / 2,
      halfH: TRACK_HEIGHT / 2 + WALL_THICKNESS,
      angleDeg: 0,
    },
    {
      cx: TRACK_WIDTH / 2,
      cy: -WALL_THICKNESS / 2,
      halfW: TRACK_WIDTH / 2 + WALL_THICKNESS,
      halfH: WALL_THICKNESS / 2,
      angleDeg: 0,
    },
    {
      cx: TRACK_WIDTH / 2,
      cy: TRACK_HEIGHT + WALL_THICKNESS / 2,
      halfW: TRACK_WIDTH / 2 + WALL_THICKNESS,
      halfH: WALL_THICKNESS / 2,
      angleDeg: 0,
    },
  ],
  obstacles: {
    bars: [
      { cx: 7.4, cy: 110, halfW: 8, halfH: 0.7, angleDeg: -22 },
      { cx: 32.6, cy: 95, halfW: 8, halfH: 0.7, angleDeg: 22 },
      { cx: 7.4, cy: 66, halfW: 8, halfH: 0.7, angleDeg: -22 },
      { cx: 32.6, cy: 52, halfW: 8, halfH: 0.7, angleDeg: 22 },
      { cx: 20, cy: 26, halfW: 6.5, halfH: 0.7, angleDeg: -20 },
    ],
    pegs: [
      { cx: 18, cy: 80, radius: 2.4 },
      { cx: 22, cy: 38, radius: 2.4 },
    ],
  },
  startLineY: 124,
  startZone: { minX: 0, minY: 124, maxX: TRACK_WIDTH, maxY: TRACK_HEIGHT },
  startPositions: [
    { x: 6, y: 127.5 },
    { x: 2, y: 133.5 },
    { x: 14, y: 127.5 },
    { x: 10, y: 133.5 },
    { x: 22, y: 127.5 },
    { x: 18, y: 133.5 },
    { x: 30, y: 127.5 },
    { x: 26, y: 133.5 },
    { x: 38, y: 127.5 },
    { x: 34, y: 133.5 },
  ],
  finishLine: {
    y: 8,
    zone: { minX: 0, minY: 5, maxX: TRACK_WIDTH, maxY: 11 },
    sensor: { cx: TRACK_WIDTH / 2, cy: 8, halfW: TRACK_WIDTH / 2, halfH: 3 },
  },
  centerline: [
    { x: 20, y: 131 },
    { x: 24, y: 122 },
    { x: 27, y: 110 },
    { x: 24, y: 98 },
    { x: 12, y: 92 },
    { x: 9, y: 82 },
    { x: 10, y: 72 },
    { x: 24, y: 62 },
    { x: 26, y: 54 },
    { x: 12, y: 46 },
    { x: 13, y: 40 },
    { x: 14, y: 30 },
    { x: 8, y: 24 },
    { x: 12, y: 16 },
    { x: 20, y: 9 },
  ],
}
