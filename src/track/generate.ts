/**
 * Seeded, validated track generation (Phase 3A).
 *
 * Every track shares one fixed frame — interior bounds, four boundary walls,
 * the variable-size starting grid, the start line, the finish line and the
 * centerline. On the obstacle tracks, seeding may only vary the interior
 * *obstacles* (angled bars, pegs, diamonds, rings and concave walls); it can
 * never move the arena, the start zone or the finish line. Wyrmwood is the
 * switchback track: its seeded course varies the ramp angles, ramp walls and
 * centerline, but the arena, start channel, start grid and finish line stay
 * fixed. A layout is accepted only if it passes `validateTrack`; the generator
 * makes at most `MAX_ATTEMPTS` seeded attempts and then falls back to a
 * hand-built, known-good layout with a `console.warn`.
 *
 * Each obstacle track's centerline is a sequence of gates. Obstacles are always
 * built *between* two gates (never past a gate), which keeps the finish-line
 * gate clear of obstacles while leaving the rest of the course lively.
 */

import {
  DEFAULT_MARBLES,
  MARBLE_DIAMETER,
  MAX_MARBLES,
  MIN_MARBLES,
} from '../config'
import type { TrackId } from '../data'
import { mulberry32, randomInRange, randomIntInRange, type RandomSource } from './rng'
import { normalizeSeed } from './seed'
import type { TrackObstacles, TrackPoint, TrackRect, TrackData, TrackDiamond, TrackRing, TrackConcaveWall, TrackSpinner } from './track'
import { validateTrack } from './validate'

export const TRACK_WIDTH = 40
export const TRACK_HEIGHT = 146
export const WYRMWOOD_TRACK_HEIGHT = 240
export const IRONHALLOW_TRACK_HEIGHT = 240
const WALL_THICKNESS = 6

const TRACK_HEIGHTS: Record<TrackId, number> = {
  'wyrmwood': WYRMWOOD_TRACK_HEIGHT,
  'eldergarde': TRACK_HEIGHT,
  'ironhallow': IRONHALLOW_TRACK_HEIGHT,
  'ashenmoor': TRACK_HEIGHT,
}

export function trackHeightFor(trackId: TrackId): number {
  return TRACK_HEIGHTS[trackId]
}

/** Seeded attempts before the hand-built fallback is used. */
export const MAX_ATTEMPTS = 20

/** Interior clearances the validator enforces, expressed in marble diameters D. */
export const START_MIN_PAIR_D = 1.3
export const START_MIN_WALL_D = 1.0
export const START_MIN_OBSTACLE_D = 1.5
export const OBSTACLE_MIN_GAP_D = 0.5
export const CENTERLINE_CLEARANCE_D = 1.2
export const FINISH_MIN_OBSTACLE_D = 2.5

/** Default seed per track: each default layout is exact and hand-checkable. */
export const DEFAULT_SEEDS: Record<TrackId, number> = {
  'wyrmwood': 1,
  'eldergarde': 1,
  'ironhallow': 1,
  'ashenmoor': 1,
}

/** Y of the start line and the bottom of the shared start zone. */
export const START_LINE_Y = 124
export const WYRMWOOD_START_LINE_Y = 216
export const IRONHALLOW_START_LINE_Y = 216

/** Maximum number of marbles in a row (a row of four is the staggered one). */
const START_GRID_LANES = 5
/** Centre-to-wall margin for the widest row, in world units. */
const START_GRID_MARGIN = START_MIN_WALL_D * MARBLE_DIAMETER + 0.8
/**
 * How far the first row sits above the start line. This keeps the widest row
 * at least 1.5D above the tallest rotated obstacle on every seeded layout.
 */
const START_GRID_BOTTOM_OFFSET = 5
const WYRMWOOD_START_GRID_BOTTOM_OFFSET = 1.2
/** Keeps the top row clear of the ceiling, in world units. */
const START_GRID_TOP_MARGIN = START_MIN_WALL_D * MARBLE_DIAMETER + 0.4
const WYRMWOOD_START_GRID_TOP_MARGIN = START_MIN_WALL_D * MARBLE_DIAMETER + 0.5
/** Largest row spacing; tighter rows are used only when the count needs them. */
const START_GRID_MAX_ROW_GAP = 6

export interface RampSegment {
  /** Floor-span endpoints at the channel walls, in world space. */
  xStart: number
  yStart: number
  xEnd: number
  yEnd: number
  angleDeg: number
}

export interface WyrmwoodCourse {
  walls: TrackRect[]
  ramps: RampSegment[]
  centerline: TrackPoint[]
}

export const WW_LEFT_WALL_CX = 4.3
export const WW_RIGHT_WALL_CX = 35.7
export const WW_WALL_HALF = 0.8
export const WW_FLOOR_LEFT = WW_LEFT_WALL_CX + WW_WALL_HALF
export const WW_FLOOR_RIGHT = WW_RIGHT_WALL_CX - WW_WALL_HALF
/** Inset turn points so recovery has clearance from the side walls. */
const WW_TURN_LEFT = 10
const WW_TURN_RIGHT = 30
const WW_START_CHANNEL_LEFT = 8
const WW_START_CHANNEL_RIGHT = 32
const WW_START_CHANNEL_WIDTH = WW_START_CHANNEL_RIGHT - WW_START_CHANNEL_LEFT
const WW_RAMP_HALF_H = 0.5
/** Distance from the ramp surface to the advisory marble-centre line. */
const WW_PATH_LIFT = 4.5
/** Gap between a ramp's low edge and the wall, so the marble can roll off. */
const WW_RAMP_GAP = 5
/** Drop from the start line onto the first ramp. */
const WW_START_DROP = 8
/** Vertical drop at each switchback turn. */
const WW_TURN_DROP = 26
const WW_BOTTOM_Y = 2.5
const WW_MIN_ANGLE_DEG = 13
const WW_MAX_ANGLE_DEG = 14

function surfaceAt(ramp: RampSegment, x: number): number {
  const span = ramp.xEnd - ramp.xStart
  if (span === 0) return ramp.yStart
  const t = (x - ramp.xStart) / span
  return ramp.yStart + (ramp.yEnd - ramp.yStart) * t
}

/**
 * Builds the Wyrmwood switchback frame: a 24-wide start channel for 20 marbles,
 * then seeded 13..14 degree legs joined by 26-unit drops. The gap between each
 * ramp's low edge and the opposite wall lets marbles roll off instead of
 * resting against the wall.
 */
function buildWyrmwoodCourse(seed: number): WyrmwoodCourse {
  const rng = mulberry32((seed ^ 0x85ebca6b) >>> 0)
  const walls: TrackRect[] = [
    {
      cx: WW_LEFT_WALL_CX,
      cy: WYRMWOOD_START_LINE_Y / 2,
      halfW: WW_WALL_HALF,
      halfH: WYRMWOOD_START_LINE_Y / 2,
      angleDeg: 0,
      role: 'channel',
    },
    {
      cx: WW_RIGHT_WALL_CX,
      cy: WYRMWOOD_START_LINE_Y / 2,
      halfW: WW_WALL_HALF,
      halfH: WYRMWOOD_START_LINE_Y / 2,
      angleDeg: 0,
      role: 'channel',
    },
    {
      cx: WW_START_CHANNEL_LEFT - 1,
      cy: (WYRMWOOD_START_LINE_Y + WYRMWOOD_TRACK_HEIGHT) / 2,
      halfW: 1,
      halfH: (WYRMWOOD_TRACK_HEIGHT - WYRMWOOD_START_LINE_Y) / 2,
      angleDeg: 0,
      role: 'channel',
    },
    {
      cx: WW_START_CHANNEL_RIGHT + 1,
      cy: (WYRMWOOD_START_LINE_Y + WYRMWOOD_TRACK_HEIGHT) / 2,
      halfW: 1,
      halfH: (WYRMWOOD_TRACK_HEIGHT - WYRMWOOD_START_LINE_Y) / 2,
      angleDeg: 0,
      role: 'channel',
    },
  ]

  const ramps: RampSegment[] = []
  const centerline: TrackPoint[] = [
    { x: TRACK_WIDTH / 2, y: WYRMWOOD_START_LINE_Y },
  ]
  let fromLeft = true
  let highY = WYRMWOOD_START_LINE_Y - WW_START_DROP
  let rampIndex = 0

  while (highY > WW_BOTTOM_Y) {
    const angleDeg = randomInRange(rng, WW_MIN_ANGLE_DEG, WW_MAX_ANGLE_DEG)
    const angle = (angleDeg * Math.PI) / 180
    const xStart = fromLeft ? WW_FLOOR_LEFT : WW_FLOOR_RIGHT
    let xEnd = fromLeft
      ? WW_FLOOR_RIGHT - WW_RAMP_GAP
      : WW_FLOOR_LEFT + WW_RAMP_GAP
    let drop = Math.abs(xEnd - xStart) * Math.tan(angle)
    if (highY - drop < WW_BOTTOM_Y) {
      drop = Math.max(highY - WW_BOTTOM_Y, 0.1)
      const direction = xEnd > xStart ? 1 : -1
      xEnd = xStart + (direction * drop) / Math.tan(angle)
    }
    const yEnd = highY - drop
    const span = Math.abs(xEnd - xStart)

    walls.push({
      cx: (xStart + xEnd) / 2,
      cy: (highY + yEnd) / 2,
      halfW: span / 2 / Math.cos(angle),
      halfH: WW_RAMP_HALF_H,
      angleDeg: xEnd > xStart ? -angleDeg : angleDeg,
      role: 'ramp',
    })

    const ramp: RampSegment = { xStart, yStart: highY, xEnd, yEnd, angleDeg }
    ramps.push(ramp)

    const turnStartX = fromLeft ? WW_TURN_LEFT : WW_TURN_RIGHT
    const turnEndX = fromLeft ? WW_TURN_RIGHT : WW_TURN_LEFT
    if (rampIndex === 0) {
      centerline.push({
        x: TRACK_WIDTH / 2,
        y: surfaceAt(ramp, TRACK_WIDTH / 2) + WW_PATH_LIFT,
      })
    } else {
      centerline.push({
        x: turnStartX,
        y: surfaceAt(ramp, turnStartX) + WW_PATH_LIFT,
      })
    }
    centerline.push({
      x: turnEndX,
      y: surfaceAt(ramp, turnEndX) + WW_PATH_LIFT,
    })

    highY = yEnd - WW_TURN_DROP
    fromLeft = !fromLeft
    rampIndex += 1
  }

  return { walls, ramps, centerline }
}

const WYRMWOOD_COURSES = new Map<number, WyrmwoodCourse>()

export function wyrmwoodCourse(seed: number): WyrmwoodCourse {
  const cached = WYRMWOOD_COURSES.get(seed)
  if (cached) return cached
  const course = buildWyrmwoodCourse(seed)
  WYRMWOOD_COURSES.set(seed, course)
  return course
}

/* ------------------------------------------------------------------------- *
 * Ironhallow
 *
 * The spec (reference/ironhallow-spec.md) describes a 40 x 160 image, y from
 * the top. Ironhallow keeps the 240-tall arena, so every spec coordinate is
 * converted with `yWorld = 240 - 1.5 * ySpec`. The course is a real polyline
 * channel: the two boundary polylines below are the *inner* faces of the
 * channel walls, and the space outside them is dead area. The ten spec
 * sections all exist, and the course is deliberately harder than the spec:
 * three teeth rows instead of two, a second spinner row, three islands and a
 * denser peg field.
 * ------------------------------------------------------------------------- */

const IH_WALL = 0.8
export const IH_START_LEFT = 14
export const IH_START_RIGHT = 26
export const IH_START_WIDTH = IH_START_RIGHT - IH_START_LEFT
export const IH_START_CLEAR_HEIGHT = 24

type BoundarySide = 'left' | 'right'

/** Inner faces of the left channel wall, top to bottom. */
const IH_LEFT_BOUNDARY: TrackPoint[] = [
  { x: 14, y: 240 },
  { x: 14, y: 216 },
  { x: 4, y: 199.5 },
  { x: 12, y: 192 },
  { x: 12, y: 170 },
  { x: 4, y: 163 },
  { x: 2, y: 160.5 },
  { x: 2, y: 123 },
  { x: 12, y: 103 },
  { x: 2.5, y: 100 },
  { x: 2.5, y: 89 },
  { x: 9.65, y: 87.5 },
  { x: 9.65, y: 69.5 },
  { x: 11, y: 66 },
  { x: 11, y: 46 },
  { x: 4, y: 42 },
  { x: 4, y: 28 },
  { x: 14, y: 15 },
  { x: 14, y: 0 },
]

/** Inner faces of the right channel wall, top to bottom. */
const IH_RIGHT_BOUNDARY: TrackPoint[] = [
  { x: 26, y: 240 },
  { x: 26, y: 216 },
  { x: 14, y: 199.5 },
  { x: 34, y: 192 },
  { x: 34, y: 170 },
  { x: 26, y: 163 },
  { x: 38, y: 160.5 },
  { x: 38, y: 123 },
  { x: 34, y: 103 },
  { x: 37.5, y: 100 },
  { x: 37.5, y: 89 },
  { x: 38, y: 87.5 },
  { x: 38, y: 69.5 },
  { x: 33, y: 66 },
  { x: 33, y: 46 },
  { x: 36, y: 42 },
  { x: 36, y: 28 },
  { x: 26, y: 15 },
  { x: 26, y: 0 },
]

/**
 * A thick wall box hugging one side of a boundary segment. The box is offset
 * outward by half its thickness and extended past both ends so consecutive
 * boxes overlap at corners and leave no seam a marble could slip through.
 */
function boundaryWall(a: TrackPoint, b: TrackPoint, side: BoundarySide): TrackRect {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  const nx = side === 'left' ? dy / length : -dy / length
  const ny = side === 'left' ? -dx / length : dx / length
  const cx = (a.x + b.x) / 2 + (nx * IH_WALL) / 2
  const cy = (a.y + b.y) / 2 + (ny * IH_WALL) / 2
  return {
    cx,
    cy,
    halfW: length / 2 + IH_WALL / 2,
    halfH: IH_WALL / 2,
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    role: 'channel',
  }
}

function polylineWalls(points: readonly TrackPoint[], side: BoundarySide): TrackRect[] {
  const walls: TrackRect[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    walls.push(boundaryWall(points[i], points[i + 1], side))
  }
  return walls
}

/** The fixed Ironhallow channel, identical for every seed and marble count. */
export function ironhallowWalls(): TrackRect[] {
  return [
    ...polylineWalls(IH_LEFT_BOUNDARY, 'left'),
    ...polylineWalls(IH_RIGHT_BOUNDARY, 'right'),
  ]
}

/**
 * Advisory racing line. It follows the channel, takes the left branch around
 * the islands, skips through the teeth and spinner gauntlets (obstacles stand
 * on the line there, which is why recovery refuses those stretches), then
 * hugs the left of the peg field before the lower funnel.
 */
export const IRONHALLOW_CENTERLINE: TrackPoint[] = [
  { x: 20, y: 238 },
  { x: 20, y: 220 },
  { x: 18, y: 216 },
  { x: 10, y: 208 },
  { x: 10, y: 200 },
  { x: 17, y: 196 },
  { x: 23, y: 191 },
  { x: 20.9, y: 180 },
  { x: 16, y: 170 },
  { x: 14, y: 164 },
  { x: 17.3, y: 159 },
  { x: 17.3, y: 150 },
  { x: 17.3, y: 140 },
  { x: 17.3, y: 133 },
  { x: 20, y: 122 },
  { x: 23, y: 106 },
  { x: 18.46, y: 101 },
  { x: 18.46, y: 91 },
  { x: 18.46, y: 88 },
  { x: 20, y: 70 },
  { x: 30, y: 63 },
  { x: 30, y: 58 },
  { x: 30, y: 56.5 },
  { x: 14, y: 54 },
  { x: 14, y: 50 },
  { x: 14, y: 48.5 },
  { x: 30.5, y: 46 },
  { x: 30.5, y: 42 },
  { x: 31, y: 38 },
  { x: 32.5, y: 34 },
  { x: 32.5, y: 30 },
  { x: 28, y: 25 },
  { x: 25, y: 20 },
  { x: 20, y: 15 },
  { x: 20, y: 8 },
]

const IH_START_ROW_GAP = 3
const IH_START_BOTTOM_Y = 217
const IH_START_TOP_Y = 237.6
const IH_START_LANE_SPACING = 3

/**
 * Deterministic 2..20 grid for the 12-wide, 24-tall start channel. Three
 * lanes sit at x = 17, 20, 23; rows alternate three and two marbles, which is
 * the widest staggered arrangement that fits the 1.3D pair rule.
 */
function ironhallowStartPositions(total: number): { x: number; y: number }[] {
  const lanes = Math.min(3, total)
  const rowCounts: number[] = []
  let remaining = total
  while (remaining > 0) {
    const capacity = rowCounts.length % 2 === 0 ? lanes : Math.max(1, lanes - 1)
    const take = Math.min(capacity, remaining)
    rowCounts.push(take)
    remaining -= take
  }
  if (rowCounts.length > 1 && rowCounts[rowCounts.length - 1] === 1) {
    const previous = rowCounts[rowCounts.length - 2]
    if (previous > 1) {
      rowCounts[rowCounts.length - 2] = previous - 1
      rowCounts[rowCounts.length - 1] = 2
    }
  }

  const rows = rowCounts.length
  const rowGap =
    rows > 1
      ? Math.min(
          IH_START_ROW_GAP,
          (IH_START_TOP_Y - IH_START_BOTTOM_Y) / (rows - 1),
        )
      : 0

  const positions: { x: number; y: number }[] = []
  for (let row = 0; row < rows; row += 1) {
    const rowCount = rowCounts[row]
    const y = IH_START_BOTTOM_Y + rowGap * row
    const leftmost = TRACK_WIDTH / 2 - ((rowCount - 1) / 2) * IH_START_LANE_SPACING
    for (let column = 0; column < rowCount; column += 1) {
      positions.push({
        x: leftmost + IH_START_LANE_SPACING * column,
        y,
      })
    }
  }
  return positions
}

/**
 * Deterministic start grid for `count` marbles (2..20).
 *
 * Rows are staggered and horizontally centred in the start zone. The first
 * row is the widest; the next row is one marble narrower so its columns sit
 * between the first row's columns. Additional rows repeat that pattern. The
 * rows are placed from the start line upward, and the row spacing shrinks only
 * as far as the 1.3D pair rule allows, so 20 marbles fit the existing start
 * zone without moving any wall.
 */
export function startPositionsFor(count: number, trackId?: TrackId): { x: number; y: number }[] {
  const total = Math.min(
    Math.max(Math.trunc(count), MIN_MARBLES),
    MAX_MARBLES,
  )
  if (trackId === 'ironhallow') return ironhallowStartPositions(total)
  const channelWidth = trackId === 'wyrmwood' ? WW_START_CHANNEL_WIDTH : TRACK_WIDTH
  const maxLanes = trackId === 'wyrmwood' ? 5 : START_GRID_LANES
  const lanes = Math.min(maxLanes, total)
  
  const laneSpacing =
    trackId === 'wyrmwood'
      ? (channelWidth - START_MIN_WALL_D * MARBLE_DIAMETER * 2) / (maxLanes - 1)
      : (channelWidth - START_GRID_MARGIN * 2) / (maxLanes - 1)

  const rowCounts: number[] = []
  let remaining = total
  if (trackId === 'wyrmwood') {
    while (remaining > 0) {
      const capacity = rowCounts.length % 2 === 0 ? maxLanes : maxLanes - 1
      const take = Math.min(capacity, remaining)
      rowCounts.push(take)
      remaining -= take
    }
  } else {
    while (remaining > 0) {
      const capacity = Math.max(1, rowCounts.length % 2 === 0 ? lanes : lanes - 1)
      const take = Math.min(capacity, remaining)
      rowCounts.push(take)
      remaining -= take
    }
    if (rowCounts.length > 1 && rowCounts[rowCounts.length - 1] === 1) {
      const previous = rowCounts[rowCounts.length - 2]
      if (previous > 1) {
        rowCounts[rowCounts.length - 2] = previous - 1
        rowCounts[rowCounts.length - 1] = 2
      }
    }
  }

  const bottomY =
    (trackId ? START_LINE_Y_MAP[trackId] : START_LINE_Y) +
    (trackId === 'wyrmwood' ? WYRMWOOD_START_GRID_BOTTOM_OFFSET : START_GRID_BOTTOM_OFFSET)
  const height = trackId ? trackHeightFor(trackId) : TRACK_HEIGHT
  const topY =
    height -
    (trackId === 'wyrmwood' ? WYRMWOOD_START_GRID_TOP_MARGIN : START_GRID_TOP_MARGIN)

  const rows = rowCounts.length
  const rowGap =
    rows > 1
      ? Math.max(
          START_MIN_PAIR_D * MARBLE_DIAMETER + 0.05,
          Math.min(
            trackId === 'wyrmwood' ? 3.5 : START_GRID_MAX_ROW_GAP,
            (topY - bottomY) / (rows - 1),
          ),
        )
      : 0

  const positions: { x: number; y: number }[] = []
  for (let row = 0; row < rows; row += 1) {
    const rowCount = rowCounts[row]
    const y = bottomY + rowGap * row
    const channelLeft =
      trackId === 'wyrmwood'
        ? WW_START_CHANNEL_LEFT
        : (TRACK_WIDTH - channelWidth) / 2
    const leftmost =
      channelLeft + (channelWidth / 2 - ((rowCount - 1) / 2) * laneSpacing)

    for (let column = 0; column < rowCount; column += 1) {
      positions.push({ x: leftmost + laneSpacing * column, y })
    }
  }
  return positions
}

/** The default 10-marble grid, kept as a named export for tests. */
export const START_POSITIONS = startPositionsFor(DEFAULT_MARBLES)

interface Interval {
  min: number
  max: number
}

interface Gate {
  x: number
  y: number
}

type Recipe =
  | { kind: 'bar'; x: Interval; angle: [number, number]; halfW: Interval }
  | {
      kind: 'ledge'
      /** Which wall the ledge is anchored to. */
      side: 'left' | 'right'
      /** How far the ledge reaches from that wall (inner tip x). */
      reach: Interval
      angle: [number, number]
    }
  | { kind: 'pegs'; count: [number, number]; radius: Interval; edge: Interval }
  | { kind: 'diamond'; x: Interval; radius: Interval; angle: [number, number] }
  | { kind: 'ring'; x: Interval; radius: Interval; thickness: Interval }
  | { kind: 'concaveWall'; side: 'left' | 'right'; x: Interval; concavity: Interval }
  | { kind: 'empty' }

interface TrackSpec {
  id: TrackId
  name: string
  tagline: string
  gates: Gate[]
  recipes: Recipe[]
}

const WYRMWOOD_GATES: Gate[] = [
  { x: 20, y: WYRMWOOD_START_LINE_Y },
  { x: 20, y: 8 },
]

export const START_LINE_Y_MAP: Record<TrackId, number> = {
  'wyrmwood': WYRMWOOD_START_LINE_Y,
  'eldergarde': 124,
  'ironhallow': IRONHALLOW_START_LINE_Y,
  'ashenmoor': 124,
}

const WYRMWOOD_RECIPES: Recipe[] = []

const ELDERGARDE_GATES: Gate[] = [
  { x: 20, y: 124 },
  { x: 20, y: 8 },
]
const IRONHALLOW_GATES: Gate[] = [
  { x: 20, y: IRONHALLOW_START_LINE_Y },
  { x: 20, y: 8 },
]
const ASHENMOOR_GATES: Gate[] = [
  { x: 20, y: 124 },
  { x: 20, y: 8 },
]

const SPECS: Record<TrackId, TrackSpec> = {
  'wyrmwood': {
    id: 'wyrmwood',
    name: 'Wyrmwood',
    tagline: 'Pachinko-style forest maze.',
    gates: WYRMWOOD_GATES,
    recipes: WYRMWOOD_RECIPES,
  },
  'eldergarde': {
    id: 'eldergarde',
    name: 'Eldergarde',
    tagline: 'Ancient funnel chamber.',
    gates: ELDERGARDE_GATES,
    recipes: [
      { kind: 'empty' },
    ],
  },
    'ironhallow': {
    id: 'ironhallow',
    name: 'Ironhallow',
    tagline: 'Hardened, structured iron maze.',
    gates: IRONHALLOW_GATES,
    recipes: [
      { kind: 'empty' },
    ],
  },

  'ashenmoor': {
    id: 'ashenmoor',
    name: 'Ashenmoor',
    tagline: 'Denser, unforgiving depths.',
    gates: ASHENMOOR_GATES,
    recipes: [
      { kind: 'empty' },
    ],
  },
}

export function trackSpec(trackId: TrackId): TrackSpec {
  return SPECS[trackId]
}

export function centerlineFor(
  trackId: TrackId,
  seed: number = DEFAULT_SEEDS[trackId],
): TrackPoint[] {
  if (trackId === 'wyrmwood') {
    return wyrmwoodCourse(normalizeSeed(seed)).centerline.map((point) => ({ ...point }))
  }
  if (trackId === 'ironhallow') {
    return IRONHALLOW_CENTERLINE.map((point) => ({ ...point }))
  }
  return SPECS[trackId].gates.map((gate) => ({ x: gate.x, y: gate.y }))
}

function wallRects(height: number): TrackRect[] {
  return [
    {
      cx: -WALL_THICKNESS / 2,
      cy: height / 2,
      halfW: WALL_THICKNESS / 2,
      halfH: height / 2 + WALL_THICKNESS,
      angleDeg: 0,
      role: 'boundary',
    },
    {
      cx: TRACK_WIDTH + WALL_THICKNESS / 2,
      cy: height / 2,
      halfW: WALL_THICKNESS / 2,
      halfH: height / 2 + WALL_THICKNESS,
      angleDeg: 0,
      role: 'boundary',
    },
    {
      cx: TRACK_WIDTH / 2,
      cy: -WALL_THICKNESS / 2,
      halfW: TRACK_WIDTH / 2 + WALL_THICKNESS,
      halfH: WALL_THICKNESS / 2,
      angleDeg: 0,
      role: 'boundary',
    },
    {
      cx: TRACK_WIDTH / 2,
      cy: height + WALL_THICKNESS / 2,
      halfW: TRACK_WIDTH / 2 + WALL_THICKNESS,
      halfH: WALL_THICKNESS / 2,
      angleDeg: 0,
      role: 'boundary',
    },
  ]
}

/** Everything except the obstacles is fixed for a track except Wyrmwood's seeded ramps. */
function baseTrack(
  trackId: TrackId,
  count: number,
  seed: number = DEFAULT_SEEDS[trackId],
): Omit<TrackData, 'obstacles'> {
  const spec = SPECS[trackId]
  const height = trackHeightFor(trackId)
  const startLineY = START_LINE_Y_MAP[trackId] ?? START_LINE_Y
  const walls = wallRects(height)
  const course = trackId === 'wyrmwood' ? wyrmwoodCourse(seed) : null
  if (course) {
    walls.push(...course.walls)
  }
  if (trackId === 'ironhallow') {
    walls.push(...ironhallowWalls())
  }
  const deadZones =
    trackId === 'wyrmwood'
      ? [
          { minX: 0, minY: 0, maxX: WW_FLOOR_LEFT, maxY: WYRMWOOD_START_LINE_Y },
          { minX: WW_FLOOR_RIGHT, minY: 0, maxX: TRACK_WIDTH, maxY: WYRMWOOD_START_LINE_Y },
          { minX: 0, minY: WYRMWOOD_START_LINE_Y, maxX: WW_START_CHANNEL_LEFT, maxY: WYRMWOOD_TRACK_HEIGHT },
          { minX: WW_START_CHANNEL_RIGHT, minY: WYRMWOOD_START_LINE_Y, maxX: TRACK_WIDTH, maxY: WYRMWOOD_TRACK_HEIGHT },
        ]
      : undefined
  return {
    id: spec.id,
    name: spec.name,
    width: TRACK_WIDTH,
    height,
    bounds: { minX: 0, minY: 0, maxX: TRACK_WIDTH, maxY: height },
    walls,
    startLineY,
    startZone: {
      minX:
        trackId === 'ironhallow'
          ? IH_START_LEFT
          : trackId === 'wyrmwood'
            ? WW_START_CHANNEL_LEFT
            : 0,
      minY: startLineY,
      maxX:
        trackId === 'ironhallow'
          ? IH_START_RIGHT
          : trackId === 'wyrmwood'
            ? WW_START_CHANNEL_RIGHT
            : TRACK_WIDTH,
      maxY: height,
    },
    startPositions: startPositionsFor(count, trackId),
    finishLine:
      trackId === 'ironhallow'
        ? {
            y: 12.5,
            zone: { minX: 14, minY: 10, maxX: 26, maxY: 15 },
            sensor: { cx: 20, cy: 12.5, halfW: 6, halfH: 2.5 },
          }
        : {
            y: 8,
            zone: { minX: 0, minY: 5, maxX: TRACK_WIDTH, maxY: 11 },
            sensor: { cx: TRACK_WIDTH / 2, cy: 8, halfW: TRACK_WIDTH / 2, halfH: 3 },
          },
    centerline: centerlineFor(trackId, seed),
    deadZones,
  }
}

/**
 * The fixed Ironhallow obstacle set. Positions never depend on the seed; only
 * the spinner phases and per-spinner angular speeds do, and those are drawn
 * from `rng`. Row 1 blocks the channel wall-to-wall (swept-circle gaps of at
 * most 0.3), row 2 leaves 1.0D+ escape lanes on both sides.
 */
function ironhallowObstacles(rng: RandomSource): TrackObstacles {
  const teeth: TrackRect[] = []
  const teethRows = [98, 94.5, 91]
  const teethColumns = [8.69, 11.69, 14.69, 22.23, 25.23, 28.23, 31.23]
  for (let row = 0; row < teethRows.length; row += 1) {
    const angleDeg = row % 2 === 0 ? 30 : -30
    for (const cx of teethColumns) {
      teeth.push({
        cx,
        cy: teethRows[row],
        halfW: 1.35,
        halfH: 0.25,
        angleDeg,
        role: 'teeth',
      })
    }
  }

  const pegs: TrackObstacles['pegs'] = []
  for (const y of [178.5, 175.5, 171]) {
    for (const x of [18.7, 23.1]) {
      pegs.push({ cx: x, cy: y, radius: 0.7 })
    }
  }
  const fieldRows: { y: number; xs: number[] }[] = [
    { y: 40, xs: [10.8, 15.4, 20, 24.6, 29.2] },
    { y: 35, xs: [13.1, 17.7, 22.3, 26.9] },
    { y: 30, xs: [10.8, 15.4, 20, 24.6, 29.2] },
  ]
  for (const row of fieldRows) {
    for (const x of row.xs) pegs.push({ cx: x, cy: row.y, radius: 0.7 })
  }

  const diamonds: TrackDiamond[] = [
    { cx: 10.9, cy: 146, halfW: 4, halfH: 14, angleDeg: 0 },
    { cx: 21.8, cy: 154, halfW: 2, halfH: 6, angleDeg: 0 },
    { cx: 31.55, cy: 154.5, halfW: 1.5, halfH: 5.5, angleDeg: 0 },
  ]

  const bars: TrackRect[] = [
    { cx: 18.5, cy: 60, halfW: 8.5, halfH: 0.3, angleDeg: -10, role: 'deflector' },
    { cx: 25.5, cy: 52, halfW: 8.5, halfH: 0.3, angleDeg: 10, role: 'deflector' },
    { cx: 18.5, cy: 45, halfW: 8.5, halfH: 0.3, angleDeg: -10, role: 'deflector' },
    { cx: 19, cy: 23, halfW: 1.5, halfH: 0.3, angleDeg: -35, role: 'deflector' },
    { cx: 15.4, cy: 18.5, halfW: 1.5, halfH: 0.3, angleDeg: 35, role: 'deflector' },
  ]

  const spinners: TrackSpinner[] = []
  const spinnerRows = [
    { y: 82, xs: [12.5, 18.2, 23.8, 29.5, 35.05] },
    { y: 75.5, xs: [15.3, 20.95, 26.6, 32.25] },
  ]
  let index = 0
  for (const row of spinnerRows) {
    for (const cx of row.xs) {
      const phaseDeg = randomInRange(rng, 0, 360)
      const speed = randomInRange(rng, 1.8, 2.2)
      spinners.push({
        cx,
        cy: row.y,
        halfW: 2.7,
        halfH: 0.5,
        angleDeg: 90 + phaseDeg,
        angularVelocity: index % 2 === 0 ? speed : -speed,
      })
      index += 1
    }
  }

  return {
    bars,
    pegs,
    diamonds,
    rings: [],
    concaveWalls: [],
    teeth,
    spinners,
  }
}

/** Constructs the interior obstacles for `trackId`, drawing only on `rng`. */
function buildObstacles(trackId: TrackId, rng: RandomSource): TrackObstacles {
  if (trackId === 'ironhallow') {
    return ironhallowObstacles(rng)
  }
  if (trackId === 'wyrmwood') {
    return {
      bars: [],
      pegs: [],
      diamonds: [],
      rings: [],
      concaveWalls: [],
      teeth: [],
      spinners: [],
    }
  }

  const spec = SPECS[trackId]
  const bars: TrackRect[] = []
  const pegs: TrackObstacles['pegs'] = []
  const diamonds: TrackDiamond[] = []
  const rings: TrackRing[] = []
  const concaveWalls: TrackConcaveWall[] = []
  const spinners: TrackSpinner[] = []

  const xClamp = (value: number): number =>
    Math.min(Math.max(value, 2.5), TRACK_WIDTH - 2.5)

  for (let i = 0; i < spec.gates.length - 1; i += 1) {
    const upper = spec.gates[i]
    const lower = spec.gates[i + 1]
    const recipe = spec.recipes[i]
    if (!recipe || recipe.kind === 'empty') continue

    // Keep obstacles clear of both gates: a fixed 4-unit buffer is safe for
    // the 11-16 unit gate spacing these tracks use.
    const yMin = lower.y + 4
    const yMax = upper.y - 4
    if (yMax <= yMin) continue

    if (recipe.kind === 'bar') {
      bars.push({
        cx: xClamp(randomInRange(rng, recipe.x.min, recipe.x.max)),
        cy: (yMin + yMax) / 2,
        halfW: randomInRange(rng, recipe.halfW.min, recipe.halfW.max),
        halfH: 0.7,
        angleDeg: randomInRange(rng, recipe.angle[0], recipe.angle[1]),
      })
    } else if (recipe.kind === 'ledge') {
      // A ledge reaches in from one wall leaving a single narrow gate on the
      // other side, so marbles must cross the full width to make progress.
      const reach = randomInRange(rng, recipe.reach.min, recipe.reach.max)
      const fromLeft = recipe.side === 'left'
      bars.push({
        cx: fromLeft ? reach / 2 : TRACK_WIDTH - reach / 2,
        cy: (yMin + yMax) / 2,
        halfW: reach / 2,
        halfH: 0.7,
        angleDeg: randomInRange(rng, recipe.angle[0], recipe.angle[1]),
      })
    } else if (recipe.kind === 'pegs') {
      const count = randomIntInRange(rng, recipe.count[0], recipe.count[1])
      // Spread pegs down the interval, alternating which edge they hug, and
      // keep every peg at least the required gap from its neighbours.
      for (let n = 0; n < count; n += 1) {
        const base = randomInRange(rng, recipe.edge.min, recipe.edge.max)
        const fromLeft = n % 2 === 0
        const cy = yMin + ((yMax - yMin) * (n + 1)) / (count + 1)
        pegs.push({
          cx: xClamp(fromLeft ? base : TRACK_WIDTH - base),
          cy: cy + randomInRange(rng, -1, 1),
          radius: randomInRange(rng, recipe.radius.min, recipe.radius.max),
        })
      }
    } else if (recipe.kind === 'diamond') {
      const size = randomInRange(rng, recipe.radius.min, recipe.radius.max)
      diamonds.push({
        cx: xClamp(randomInRange(rng, recipe.x.min, recipe.x.max)),
        cy: (yMin + yMax) / 2,
        halfW: size,
        halfH: size,
        angleDeg: randomInRange(rng, recipe.angle[0], recipe.angle[1]),
      })
    } else if (recipe.kind === 'ring') {
      rings.push({
        cx: xClamp(randomInRange(rng, recipe.x.min, recipe.x.max)),
        cy: (yMin + yMax) / 2,
        radius: randomInRange(rng, recipe.radius.min, recipe.radius.max),
        thickness: randomInRange(rng, recipe.thickness.min, recipe.thickness.max),
      })
    } else if (recipe.kind === 'concaveWall') {
      concaveWalls.push({
        cx: recipe.side === 'left' ? 0 : TRACK_WIDTH,
        cy: (yMin + yMax) / 2,
        halfW: 5,
        halfH: (yMax - yMin) / 2,
        angleDeg: 0,
        concavity: randomInRange(rng, recipe.concavity.min, recipe.concavity.max),
      })
    }
  }

  // Placeholder/Fallback for others to allow build to pass
  // Placeholder to ensure at least some variability
  // Add more bars for variability
  bars.push({ 
    cx: randomInRange(rng, 5, 35), 
    cy: randomInRange(rng, 20, 110), 
    halfW: randomInRange(rng, 3, 7), 
    halfH: 0.7, 
    angleDeg: randomInRange(rng, -45, 45) 
  })
  bars.push({ 
    cx: randomInRange(rng, 5, 35), 
    cy: randomInRange(rng, 20, 110), 
    halfW: randomInRange(rng, 3, 7), 
    halfH: 0.7, 
    angleDeg: randomInRange(rng, -45, 45) 
  })
  return { bars, pegs, diamonds, rings, concaveWalls, teeth: [], spinners }
}

function makeTrack(
  trackId: TrackId,
  obstacles: TrackObstacles,
  count: number,
  seed: number = DEFAULT_SEEDS[trackId],
): TrackData {
  return { ...baseTrack(trackId, count, seed), obstacles }
}

/**
 * Hand-built, known-good fallback obstacles per track. Used only when every
 * seeded attempt fails validation, so a playable track is always returned.
 */
function fallbackObstacles(trackId: TrackId): TrackObstacles {
  if (trackId === 'ironhallow') {
    return ironhallowObstacles(mulberry32(DEFAULT_SEEDS.ironhallow))
  }
  const spec = SPECS[trackId]
  const bars: TrackRect[] = []
  const pegs: TrackObstacles['pegs'] = []
  const diamonds: TrackDiamond[] = []
  const rings: TrackRing[] = []
  const concaveWalls: TrackConcaveWall[] = []
  const spinners: TrackSpinner[] = []
  for (let i = 0; i < spec.gates.length - 1; i += 1) {
    const recipe = spec.recipes[i]
    if (!recipe || recipe.kind === 'empty') continue
    const cy = (spec.gates[i].y + spec.gates[i + 1].y) / 2
    if (recipe.kind === 'pegs') {
      pegs.push({ cx: 8, cy, radius: 2 })
      pegs.push({ cx: 32, cy, radius: 2 })
    } else if (recipe.kind === 'ledge') {
      const reach = (recipe.reach.min + recipe.reach.max) / 2
      const fromLeft = recipe.side === 'left'
      bars.push({
        cx: fromLeft ? reach / 2 : TRACK_WIDTH - reach / 2,
        cy,
        halfW: reach / 2,
        halfH: 0.7,
        angleDeg: 0,
      })
    } else if (recipe.kind === 'diamond') {
      diamonds.push({ cx: 20, cy, halfW: 2, halfH: 2, angleDeg: 0 })
    } else if (recipe.kind === 'ring') {
      rings.push({ cx: 20, cy, radius: 2, thickness: 1 })
    } else if (recipe.kind === 'concaveWall') {
      concaveWalls.push({
        cx: recipe.side === 'left' ? 0 : TRACK_WIDTH,
        cy,
        halfW: 5,
        halfH: 5,
        angleDeg: 0,
        concavity: 0.5,
      })
    } else {
      bars.push({ cx: 20, cy, halfW: 6, halfH: 0.7, angleDeg: 0 })
    }
  }
  return { bars, pegs, diamonds, rings, concaveWalls, teeth: [], spinners }
}

/** The hand-built fallback track for `trackId` (used when seeding fails). */
export function fallbackTrack(
  trackId: TrackId,
  count: number = DEFAULT_MARBLES,
  seed: number = DEFAULT_SEEDS[trackId],
): TrackData {
  return makeTrack(trackId, fallbackObstacles(trackId), count, seed)
}

/**
 * Builds the track for `trackId` at `seed`.
 *
 * Deterministic: the same `(trackId, seed)` always yields an identical layout.
 * Bounded: at most `MAX_ATTEMPTS` attempts, then the fallback with a
 * `console.warn`. Never touches `Math.random`, `Date` or `performance.now`.
 */
export function buildTrack(
  trackId: TrackId,
  seed: number,
  count: number = DEFAULT_MARBLES,
  attempt = 0,
): TrackData {
  const normalized = normalizeSeed(seed)
  const marbleCount = Math.min(
    Math.max(Math.trunc(count), MIN_MARBLES),
    MAX_MARBLES,
  )
  const rng = mulberry32((normalized + attempt * 0x9e3779b1) >>> 0)

  const obstacles = buildObstacles(trackId, rng)
  const probe = makeTrack(trackId, obstacles, MAX_MARBLES, normalized)
  const report = validateTrack(probe, MAX_MARBLES)
  if (report.valid) return makeTrack(trackId, obstacles, marbleCount, normalized)

  if (attempt + 1 < MAX_ATTEMPTS) {
    return buildTrack(trackId, normalized, marbleCount, attempt + 1)
  }

  const fallback = fallbackTrack(trackId, marbleCount, normalized)
  const fallbackReport = validateTrack(fallback, marbleCount)
  console.warn(
    `[track] ${trackId} seeded generation failed after ${MAX_ATTEMPTS} attempts ` +
      `(seed ${normalized}); using fallback layout` +
      (fallbackReport.valid ? '' : ' (fallback also failed validation)'),
    report.violations,
  )
  return fallback
}
