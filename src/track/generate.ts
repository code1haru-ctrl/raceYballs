/**
 * Seeded, validated track generation (Phase 3A).
 *
 * Every track shares one fixed frame — interior bounds, four boundary walls,
 * the ten-slot starting grid, the start line, the finish line and the
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

import type { TrackId } from '../data'
import { mulberry32, randomInRange, randomIntInRange, type RandomSource } from './rng'
import { normalizeSeed } from './seed'
import type { TrackObstacles, TrackPoint, TrackRect, TrackData } from './track'
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
  'neon-circuit': 1,
  'chaos-canyon': 1,
  'gravity-gauntlet': 1,
}

/** Fixed staggered grid: four columns x two/three rows. */
export const START_POSITIONS = [
  { x: 4, y: 127.5 },
  { x: 13, y: 127.5 },
  { x: 22, y: 127.5 },
  { x: 31, y: 127.5 },
  { x: 4, y: 133.5 },
  { x: 13, y: 133.5 },
  { x: 22, y: 133.5 },
  { x: 31, y: 133.5 },
  { x: 4, y: 139.5 },
  { x: 13, y: 139.5 },
]

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
  | { kind: 'empty' }

interface TrackSpec {
  id: string
  name: string
  tagline: string
  gates: Gate[]
  recipes: Recipe[]
}

// Gate columns per leg (start -> finish). Each pass around a gate column always
// leaves a passage of at least the track's required width.
const NEON_GATES: Gate[] = [
  { x: 20, y: 124 },
  { x: 30, y: 110 },
  { x: 10, y: 96 },
  { x: 30, y: 82 },
  { x: 10, y: 68 },
  { x: 30, y: 54 },
  { x: 20, y: 40 },
  { x: 20, y: 8 },
]

const CHAOS_GATES: Gate[] = [
  { x: 20, y: 124 },
  { x: 10, y: 111 },
  { x: 30, y: 97 },
  { x: 11, y: 83 },
  { x: 29, y: 69 },
  { x: 10, y: 55 },
  { x: 30, y: 41 },
  { x: 20, y: 27 },
  { x: 20, y: 8 },
]

const GAUNTLET_GATES: Gate[] = [
  { x: 20, y: 124 },
  { x: 30, y: 113 },
  { x: 10, y: 102 },
  { x: 30, y: 91 },
  { x: 10, y: 80 },
  { x: 30, y: 69 },
  { x: 10, y: 58 },
  { x: 30, y: 47 },
  { x: 10, y: 36 },
  { x: 20, y: 25 },
  { x: 20, y: 8 },
]

const SPECS: Record<TrackId, TrackSpec> = {
  'neon-circuit': {
    id: 'neon-circuit',
    name: 'Neon Circuit',
    tagline: 'Sweeping S-curves with lanes at least six marbles wide.',
    gates: NEON_GATES,
    recipes: [
      { kind: 'bar', x: { min: 14, max: 26 }, angle: [-16, 16], halfW: { min: 5, max: 7 } },
      { kind: 'bar', x: { min: 14, max: 26 }, angle: [-16, 16], halfW: { min: 5, max: 7 } },
      { kind: 'bar', x: { min: 14, max: 26 }, angle: [-16, 16], halfW: { min: 5, max: 7 } },
      { kind: 'bar', x: { min: 14, max: 26 }, angle: [-16, 16], halfW: { min: 5, max: 7 } },
      { kind: 'bar', x: { min: 14, max: 26 }, angle: [-16, 16], halfW: { min: 5, max: 7 } },
      { kind: 'bar', x: { min: 14, max: 26 }, angle: [-16, 16], halfW: { min: 5, max: 7 } },
      { kind: 'empty' },
    ],
  },
  'chaos-canyon': {
    id: 'chaos-canyon',
    name: 'Chaos Canyon',
    tagline: 'Narrow passages, offset bumpers and varied bars.',
    gates: CHAOS_GATES,
    recipes: [
      { kind: 'bar', x: { min: 14, max: 27 }, angle: [-24, 24], halfW: { min: 5.5, max: 8 } },
      { kind: 'pegs', count: [2, 2], radius: { min: 1.8, max: 2.4 }, edge: { min: 6, max: 10 } },
      { kind: 'bar', x: { min: 13, max: 27 }, angle: [-24, 24], halfW: { min: 5.5, max: 8 } },
      { kind: 'pegs', count: [2, 2], radius: { min: 1.8, max: 2.4 }, edge: { min: 6, max: 10 } },
      { kind: 'bar', x: { min: 13, max: 27 }, angle: [-24, 24], halfW: { min: 5.5, max: 8 } },
      { kind: 'pegs', count: [2, 2], radius: { min: 1.8, max: 2.4 }, edge: { min: 8, max: 12 } },
      { kind: 'bar', x: { min: 14, max: 26 }, angle: [-24, 24], halfW: { min: 5.5, max: 8 } },
    ],
  },
  'gravity-gauntlet': {
    id: 'gravity-gauntlet',
    name: 'Gravity Gauntlet',
    tagline: 'Alternating left/right plunges through narrow gates and ledges.',
    gates: GAUNTLET_GATES,
    recipes: [
      { kind: 'ledge', side: 'left', reach: { min: 21, max: 23 }, angle: [-32, -27] },
      { kind: 'ledge', side: 'right', reach: { min: 17, max: 19 }, angle: [27, 32] },
      { kind: 'ledge', side: 'left', reach: { min: 21, max: 23 }, angle: [-32, -27] },
      { kind: 'ledge', side: 'right', reach: { min: 17, max: 19 }, angle: [27, 32] },
      { kind: 'ledge', side: 'left', reach: { min: 21, max: 23 }, angle: [-32, -27] },
      { kind: 'ledge', side: 'right', reach: { min: 17, max: 19 }, angle: [27, 32] },
      { kind: 'ledge', side: 'left', reach: { min: 21, max: 23 }, angle: [-32, -27] },
      { kind: 'ledge', side: 'right', reach: { min: 17, max: 19 }, angle: [27, 32] },
      { kind: 'pegs', count: [2, 2], radius: { min: 2, max: 2.6 }, edge: { min: 8, max: 12 } },
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
function baseTrack(trackId: TrackId): Omit<TrackData, 'obstacles'> {
  const spec = SPECS[trackId]
  return {
    id: spec.id,
    name: spec.name,
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    bounds: { minX: 0, minY: 0, maxX: TRACK_WIDTH, maxY: TRACK_HEIGHT },
    walls: wallRects(),
    startLineY: 124,
    startZone: { minX: 0, minY: 124, maxX: TRACK_WIDTH, maxY: TRACK_HEIGHT },
    startPositions: START_POSITIONS.map((slot) => ({ ...slot })),
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
    } else {
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
    }
  }

  return { bars, pegs }
}

function makeTrack(trackId: TrackId, obstacles: TrackObstacles): TrackData {
  return { ...baseTrack(trackId), obstacles }
}

/**
 * Hand-built, known-good fallback obstacles per track. Used only when every
 * seeded attempt fails validation, so a playable track is always returned.
 */
function fallbackObstacles(trackId: TrackId): TrackObstacles {
  const spec = SPECS[trackId]
  const bars: TrackRect[] = []
  const pegs: TrackObstacles['pegs'] = []
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
    } else {
      bars.push({ cx: 20, cy, halfW: 6, halfH: 0.7, angleDeg: 0 })
    }
  }
  return { bars, pegs }
}

/** The hand-built fallback track for `trackId` (used when seeding fails). */
export function fallbackTrack(trackId: TrackId): TrackData {
  return makeTrack(trackId, fallbackObstacles(trackId))
}

/**
 * Builds the track for `trackId` at `seed`.
 *
 * Deterministic: the same `(trackId, seed)` always yields an identical layout.
 * Bounded: at most `MAX_ATTEMPTS` attempts, then the fallback with a
 * `console.warn`. Never touches `Math.random`, `Date` or `performance.now`.
 */
export function buildTrack(trackId: TrackId, seed: number, attempt = 0): TrackData {
  const normalized = normalizeSeed(seed)
  const rng = mulberry32((normalized + attempt * 0x9e3779b1) >>> 0)

  const track = makeTrack(trackId, buildObstacles(trackId, rng))
  const report = validateTrack(track)
  if (report.valid) return track

  if (attempt + 1 < MAX_ATTEMPTS) {
    return buildTrack(trackId, normalized, attempt + 1)
  }

  const fallback = fallbackTrack(trackId)
  const fallbackReport = validateTrack(fallback)
  console.warn(
    `[track] ${trackId} seeded generation failed after ${MAX_ATTEMPTS} attempts ` +
      `(seed ${normalized}); using fallback layout` +
      (fallbackReport.valid ? '' : ' (fallback also failed validation)'),
    report.violations,
  )
  return fallback
}
