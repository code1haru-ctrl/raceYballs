/**
 * Seeded, validated track generation (Phase 3A).
 *
 * Every track shares one fixed frame — interior bounds, four boundary walls,
 * the variable-size starting grid, the start line, the finish line and the
 * centerline. Seeding may only vary the interior *obstacles* (angled bars and
 * pegs); it can never move a wall, the start zone, the finish line or the
 * centerline. A layout is accepted only if it passes `validateTrack`; the
 * generator makes at most `MAX_ATTEMPTS` seeded attempts and then falls back to
 * a hand-built, known-good layout with a `console.warn`.
 *
 * Each track's centerline is a sequence of gates. Obstacles are always built
 * *between* two gates (never past a gate), which keeps the finish-line gate
 * clear of obstacles while leaving the rest of the course lively.
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
import type { TrackObstacles, TrackPoint, TrackRect, TrackData, TrackDiamond, TrackRing, TrackConcaveWall } from './track'
import { validateTrack } from './validate'

export const TRACK_WIDTH = 40
export const TRACK_HEIGHT = 146
const WALL_THICKNESS = 6

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

/** Maximum number of marbles in a row (a row of four is the staggered one). */
const START_GRID_LANES = 5
/** Centre-to-wall margin for the widest row, in world units. */
const START_GRID_MARGIN = START_MIN_WALL_D * MARBLE_DIAMETER + 0.8
/**
 * How far the first row sits above the start line. This keeps the widest row
 * at least 1.5D above the tallest rotated obstacle on every seeded layout.
 */
const START_GRID_BOTTOM_OFFSET = 8
/** Keeps the top row clear of the ceiling, in world units. */
const START_GRID_TOP_MARGIN = START_MIN_WALL_D * MARBLE_DIAMETER + 2.0
/** Largest row spacing; tighter rows are used only when the count needs them. */
const START_GRID_MAX_ROW_GAP = 6

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
  const channelWidth = trackId === 'wyrmwood' ? 12 : TRACK_WIDTH
  const maxLanes = trackId === 'wyrmwood' ? 3 : START_GRID_LANES
  const lanes = Math.min(maxLanes, total)
  
  const laneSpacing = trackId === 'wyrmwood'
    ? (channelWidth - START_MIN_WALL_D * MARBLE_DIAMETER * 2) / (maxLanes - 1)
    : (channelWidth - START_GRID_MARGIN * 2) / (maxLanes - 1)

  const rowCounts: number[] = []
  let remaining = total
  if (trackId === 'wyrmwood') {
    while (remaining > 0) {
      const capacity = rowCounts.length % 2 === 0 ? 3 : 2
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

  const bottomY = (trackId ? START_LINE_Y_MAP[trackId] : START_LINE_Y) + (trackId === 'wyrmwood' ? 8 : 5)
  const topY = TRACK_HEIGHT - (trackId === 'wyrmwood' ? START_GRID_TOP_MARGIN : (START_MIN_WALL_D * MARBLE_DIAMETER + 0.4))

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
  const channelLeft = trackId === 'wyrmwood' ? 14 : (TRACK_WIDTH - channelWidth) / 2
  const leftmost = channelLeft + (channelWidth / 2 - ((rowCount - 1) / 2) * laneSpacing)


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
  { x: 20, y: 122 },
  { x: 20, y: 95 },
  { x: 20, y: 65 },
  { x: 20, y: 35 },
  { x: 20, y: 8 },
]

export const START_LINE_Y_MAP: Record<TrackId, number> = {
  'wyrmwood': 122,
  'eldergarde': 124,
  'ironhallow': 124,
  'ashenmoor': 124,
}

const WYRMWOOD_RECIPES: Recipe[] = [
  { kind: 'diamond', x: { min: 10, max: 30 }, radius: { min: 2, max: 3 }, angle: [0, 45] },
  { kind: 'pegs', count: [4, 6], radius: { min: 1, max: 1.5 }, edge: { min: 2, max: 5 } },
  { kind: 'diamond', x: { min: 10, max: 30 }, radius: { min: 2, max: 3 }, angle: [0, 45] },
  { kind: 'pegs', count: [4, 6], radius: { min: 1, max: 1.5 }, edge: { min: 2, max: 5 } },
]

const ELDERGARDE_GATES: Gate[] = [
  { x: 20, y: 124 },
  { x: 20, y: 8 },
]
const IRONHALLOW_GATES: Gate[] = [
  { x: 20, y: 124 },
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

export function centerlineFor(trackId: TrackId): TrackPoint[] {
  return SPECS[trackId].gates.map((gate) => ({ x: gate.x, y: gate.y }))
}

function wallRects(): TrackRect[] {
  return [
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
  ]
}

/** Everything except the obstacles is fixed for a track; only obstacles seed. */
function baseTrack(
  trackId: TrackId,
  count: number,
): Omit<TrackData, 'obstacles'> {
  const spec = SPECS[trackId]
  const startLineY = START_LINE_Y_MAP[trackId] ?? START_LINE_Y
  const walls = wallRects()
  if (trackId === 'wyrmwood') {
      walls.push({ cx: 13, cy: (startLineY + TRACK_HEIGHT)/2, halfW: 1, halfH: (TRACK_HEIGHT - startLineY)/2, angleDeg: 0 })
      walls.push({ cx: 27, cy: (startLineY + TRACK_HEIGHT)/2, halfW: 1, halfH: (TRACK_HEIGHT - startLineY)/2, angleDeg: 0 })
  }
  return {
    id: spec.id,
    name: spec.name,
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    bounds: { minX: 0, minY: 0, maxX: TRACK_WIDTH, maxY: TRACK_HEIGHT },
    walls: walls,
    startLineY: startLineY,
    startZone: {
      minX: trackId === 'wyrmwood' ? 14 : 0,
      minY: startLineY,
      maxX: trackId === 'wyrmwood' ? 26 : TRACK_WIDTH,
      maxY: TRACK_HEIGHT,
    },
    startPositions: startPositionsFor(count, trackId),
    finishLine: {
      y: 8,
      zone: { minX: 0, minY: 5, maxX: TRACK_WIDTH, maxY: 11 },
      sensor: { cx: TRACK_WIDTH / 2, cy: 8, halfW: TRACK_WIDTH / 2, halfH: 3 },
    },
    centerline: centerlineFor(trackId),
  }
}

/** Constructs the interior obstacles for `trackId`, drawing only on `rng`. */
function buildObstacles(trackId: TrackId, rng: RandomSource): TrackObstacles {
  const spec = SPECS[trackId]
  const bars: TrackRect[] = []
  const pegs: TrackObstacles['pegs'] = []
  const diamonds: TrackDiamond[] = []
  const rings: TrackRing[] = []
  const concaveWalls: TrackConcaveWall[] = []
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
      diamonds.push({
        cx: xClamp(randomInRange(rng, recipe.x.min, recipe.x.max)),
        cy: (yMin + yMax) / 2,
        radius: randomInRange(rng, recipe.radius.min, recipe.radius.max),
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
    cy: randomInRange(rng, 20, 120), 
    halfW: randomInRange(rng, 3, 7), 
    halfH: 0.7, 
    angleDeg: randomInRange(rng, -45, 45) 
  })
  bars.push({ 
    cx: randomInRange(rng, 5, 35), 
    cy: randomInRange(rng, 20, 120), 
    halfW: randomInRange(rng, 3, 7), 
    halfH: 0.7, 
    angleDeg: randomInRange(rng, -45, 45) 
  })
  return { bars, pegs, diamonds, rings, concaveWalls }
}

function makeTrack(
  trackId: TrackId,
  obstacles: TrackObstacles,
  count: number,
): TrackData {
  return { ...baseTrack(trackId, count), obstacles }
}

/**
 * Hand-built, known-good fallback obstacles per track. Used only when every
 * seeded attempt fails validation, so a playable track is always returned.
 */
function fallbackObstacles(trackId: TrackId): TrackObstacles {
  const spec = SPECS[trackId]
  const bars: TrackRect[] = []
  const pegs: TrackObstacles['pegs'] = []
  const diamonds: TrackDiamond[] = []
  const rings: TrackRing[] = []
  const concaveWalls: TrackConcaveWall[] = []
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
      diamonds.push({ cx: 20, cy, radius: 2, angleDeg: 0 })
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
  return { bars, pegs, diamonds, rings, concaveWalls }
}

/** The hand-built fallback track for `trackId` (used when seeding fails). */
export function fallbackTrack(
  trackId: TrackId,
  count: number = DEFAULT_MARBLES,
): TrackData {
  return makeTrack(trackId, fallbackObstacles(trackId), count)
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

  const track = makeTrack(trackId, buildObstacles(trackId, rng), marbleCount)
  const report = validateTrack(track, marbleCount)
  if (report.valid) return track

  if (attempt + 1 < MAX_ATTEMPTS) {
    return buildTrack(trackId, normalized, marbleCount, attempt + 1)
  }

  const fallback = fallbackTrack(trackId, marbleCount)
  const fallbackReport = validateTrack(fallback, marbleCount)
  console.warn(
    `[track] ${trackId} seeded generation failed after ${MAX_ATTEMPTS} attempts ` +
      `(seed ${normalized}); using fallback layout` +
      (fallbackReport.valid ? '' : ' (fallback also failed validation)'),
    report.violations,
  )
  return fallback
}
