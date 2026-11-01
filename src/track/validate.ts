/**
 * Structural validation for a generated track.
 *
 * `validateTrack` is deliberately conservative and threshold-based: it either
 * passes a layout or lists every violation it found. The generator calls it on
 * each seeded attempt, and the test suite calls it directly (including on
 * hand-broken layouts). The thresholds live in `generate.ts` so there is a
 * single copy of every clearance number.
 */

import {
  MARBLE_DIAMETER,
  MARBLE_RADIUS,
  MAX_MARBLES,
  MIN_MARBLES,
} from '../config'
import {
  CENTERLINE_CLEARANCE_D,
  FINISH_MIN_OBSTACLE_D,
  OBSTACLE_MIN_GAP_D,
  START_MIN_OBSTACLE_D,
  START_MIN_PAIR_D,
  START_MIN_WALL_D,
} from './generate'
import {
  circleOverlapsCircle,
  circleOverlapsRect,
  circlesSeparatedBy,
  pointDiamondDistance,
  pointRectDistance,
} from './geometry'
import type { TrackCircle, TrackData, TrackRect } from './track'

const D = MARBLE_DIAMETER

export interface ValidationReport {
  valid: boolean
  violations: string[]
}

function rectsSeparatedBy(a: TrackRect, b: TrackRect, gap: number): boolean {
  const ca = Math.cos((a.angleDeg * Math.PI) / 180)
  const sa = Math.sin((a.angleDeg * Math.PI) / 180)
  const cb = Math.cos((b.angleDeg * Math.PI) / 180)
  const sb = Math.sin((b.angleDeg * Math.PI) / 180)
  const axes = [
    { x: ca, y: sa },
    { x: -sa, y: ca },
    { x: cb, y: sb },
    { x: -sb, y: cb },
  ]
  for (const axis of axes) {
    const ra =
      Math.abs(axis.x * ca + axis.y * sa) * a.halfW +
      Math.abs(axis.x * -sa + axis.y * ca) * a.halfH
    const rb =
      Math.abs(axis.x * cb + axis.y * sb) * b.halfW +
      Math.abs(axis.x * -sb + axis.y * cb) * b.halfH
    const distance = Math.abs(
      (b.cx - a.cx) * axis.x + (b.cy - a.cy) * axis.y,
    )
    if (distance > ra + rb + gap) return true
  }
  return false
}

function rectCircleSeparatedBy(
  rect: TrackRect,
  circle: TrackCircle,
  gap: number,
): boolean {
  return pointRectDistance(circle.cx, circle.cy, rect) >= circle.radius + gap
}

/**
 * Checks bounds, the start grid for the actual marble count, obstacle spacing
 * along the centerline, centerline clearance and an unobstructed finish.
 *
 * `expectedStartCount` defaults to the grid found on the track. The generator
 * passes the requested marble count so a grid built for a different count is
 * rejected instead of silently racing fewer marbles.
 */
export function validateTrack(
  track: TrackData,
  expectedStartCount: number = track.startPositions.length,
): ValidationReport {
  const violations: string[] = []
  const { width, height } = track

  if (width <= 0 || height <= 0) {
    violations.push(`track has non-positive size ${width}x${height}`)
    return { valid: false, violations }
  }

  // --- Bounds: the start zone and finish zone must sit inside the playfield.
  const inside = (x: number, y: number): boolean =>
    x >= track.bounds.minX && x <= track.bounds.maxX &&
    y >= track.bounds.minY && y <= track.bounds.maxY
  for (const [label, zone] of [
    ['start zone', track.startZone],
    ['finish zone', track.finishLine.zone],
  ] as const) {
    if (
      !inside(zone.minX, zone.minY) ||
      !inside(zone.maxX, zone.maxY) ||
      zone.minX >= zone.maxX ||
      zone.minY >= zone.maxY
    ) {
      violations.push(`${label} is not a valid box inside the playfield`)
    }
  }
  if (track.finishLine.y < track.bounds.minY || track.finishLine.y > track.bounds.maxY) {
    violations.push('finish line lies outside the playfield')
  }

  // --- Start positions for the actual count.
  if (
    track.startPositions.length < MIN_MARBLES ||
    track.startPositions.length > MAX_MARBLES
  ) {
    violations.push(
      `expected ${MIN_MARBLES}-${MAX_MARBLES} start positions, found ${track.startPositions.length}`,
    )
  } else if (track.startPositions.length !== expectedStartCount) {
    violations.push(
      `expected ${expectedStartCount} start positions, found ${track.startPositions.length}`,
    )
  }
  const minPair = START_MIN_PAIR_D * D
  const minWall = START_MIN_WALL_D * D
  const minObstacle = START_MIN_OBSTACLE_D * D
  for (let i = 0; i < track.startPositions.length; i += 1) {
    const a = track.startPositions[i]
    if (
      a.x - MARBLE_RADIUS < track.bounds.minX ||
      a.x + MARBLE_RADIUS > track.bounds.maxX ||
      a.y - MARBLE_RADIUS < track.bounds.minY ||
      a.y + MARBLE_RADIUS > track.bounds.maxY
    ) {
      violations.push(`start slot ${i} breaches the playfield bounds`)
    }
    if (
      a.x < track.startZone.minX ||
      a.x > track.startZone.maxX ||
      a.y < track.startZone.minY ||
      a.y > track.startZone.maxY
    ) {
      violations.push(`start slot ${i} is outside the start zone`)
    }
    for (const wall of track.walls) {
      if (circleOverlapsRect(a.x, a.y, MARBLE_RADIUS, wall)) {
        violations.push(`start slot ${i} overlaps a wall`)
      }
      if (pointRectDistance(a.x, a.y, wall) < minWall - 0.001) {
        violations.push(`start slot ${i} at ${a.x.toFixed(1)},${a.y.toFixed(1)} is closer than ${START_MIN_WALL_D}D to a wall at ${wall.cx.toFixed(1)},${wall.cy.toFixed(1)}`)
      }
    }
    for (const bar of track.obstacles.bars) {
      if (pointRectDistance(a.x, a.y, bar) < minObstacle) {
        violations.push(`start slot ${i} is closer than ${START_MIN_OBSTACLE_D}D to a bar`)
      }
    }
    for (const tooth of track.obstacles.teeth) {
      if (pointRectDistance(a.x, a.y, tooth) < minObstacle) {
        violations.push(`start slot ${i} is closer than ${START_MIN_OBSTACLE_D}D to a tooth`)
      }
    }
    for (const peg of track.obstacles.pegs) {
      const centreGap = Math.hypot(a.x - peg.cx, a.y - peg.cy) - peg.radius
      if (centreGap < minObstacle) {
        violations.push(`start slot ${i} is closer than ${START_MIN_OBSTACLE_D}D to a peg`)
      }
    }
    for (const diamond of track.obstacles.diamonds) {
      if (pointDiamondDistance(a.x, a.y, diamond) < minObstacle) {
        violations.push(`start slot ${i} is closer than ${START_MIN_OBSTACLE_D}D to an island`)
      }
    }
    for (let j = i + 1; j < track.startPositions.length; j += 1) {
      const b = track.startPositions[j]
      if (Math.hypot(a.x - b.x, a.y - b.y) < minPair) {
        violations.push(`start slots ${i} and ${j} are closer than ${START_MIN_PAIR_D}D`)
      }
    }
  }

  // --- Obstacle vs obstacle spacing (>= 0.5D everywhere).
  const gap = OBSTACLE_MIN_GAP_D * D
  for (let i = 0; i < track.obstacles.bars.length; i += 1) {
    for (let j = i + 1; j < track.obstacles.bars.length; j += 1) {
      if (!rectsSeparatedBy(track.obstacles.bars[i], track.obstacles.bars[j], gap)) {
        violations.push(`bars ${i} and ${j} are closer than ${OBSTACLE_MIN_GAP_D}D`)
      }
    }
  }
  for (let i = 0; i < track.obstacles.pegs.length; i += 1) {
    for (let j = i + 1; j < track.obstacles.pegs.length; j += 1) {
      if (
        !circlesSeparatedBy(
          track.obstacles.pegs[i].cx,
          track.obstacles.pegs[i].cy,
          track.obstacles.pegs[i].radius,
          track.obstacles.pegs[j].cx,
          track.obstacles.pegs[j].cy,
          track.obstacles.pegs[j].radius,
          gap,
        )
      ) {
        violations.push(`pegs ${i} and ${j} are closer than ${OBSTACLE_MIN_GAP_D}D`)
      }
      if (
        circleOverlapsCircle(
          track.obstacles.pegs[i].cx,
          track.obstacles.pegs[i].cy,
          track.obstacles.pegs[i].radius,
          track.obstacles.pegs[j],
        )
      ) {
        violations.push(`pegs ${i} and ${j} overlap`)
      }
    }
  }
  for (let i = 0; i < track.obstacles.bars.length; i += 1) {
    for (let j = 0; j < track.obstacles.pegs.length; j += 1) {
      if (
        !rectCircleSeparatedBy(
          track.obstacles.bars[i],
          track.obstacles.pegs[j],
          gap,
        )
      ) {
        violations.push(`bar ${i} and peg ${j} are closer than ${OBSTACLE_MIN_GAP_D}D`)
      }
    }
  }

  // --- Spinners: every swept circle must either nearly seal against a wall
  // (<= 0.3) or leave a real passage (>= 1.0D). Overlap is never allowed.
  for (let i = 0; i < track.obstacles.spinners.length; i += 1) {
    const spinner = track.obstacles.spinners[i]
    const swept = Math.hypot(spinner.halfW, spinner.halfH)
    for (let w = 0; w < track.walls.length; w += 1) {
      const gap = pointRectDistance(spinner.cx, spinner.cy, track.walls[w]) - swept
      if (gap < -0.05) {
        violations.push(`spinner ${i} overlaps wall ${w}`)
      } else if (gap > 0.3 && gap < START_MIN_WALL_D * D) {
        violations.push(`spinner ${i} leaves a partial gap of ${gap.toFixed(2)} to wall ${w}`)
      }
    }
    for (let j = i + 1; j < track.obstacles.spinners.length; j += 1) {
      const other = track.obstacles.spinners[j]
      const otherSwept = Math.hypot(other.halfW, other.halfH)
      const gap =
        Math.hypot(spinner.cx - other.cx, spinner.cy - other.cy) -
        swept -
        otherSwept
      if (gap < -0.05) {
        violations.push(`spinners ${i} and ${j} overlap`)
      } else if (gap > 0.3 && gap < 1.5 * D) {
        violations.push(`spinners ${i} and ${j} leave a partial gap of ${gap.toFixed(2)}`)
      }
    }
  }

  // --- Centerline clearance: obstacles must stand off the racing line.
  const lineClearance = CENTERLINE_CLEARANCE_D * (D / 2)
  for (let i = 0; i < track.centerline.length; i += 1) {
    const point = track.centerline[i]
    for (const bar of track.obstacles.bars) {
      if (pointRectDistance(point.x, point.y, bar) < lineClearance) {
        violations.push(`centerline point ${i} is closer than ${CENTERLINE_CLEARANCE_D}D to a bar`)
      }
    }
    for (const tooth of track.obstacles.teeth) {
      if (pointRectDistance(point.x, point.y, tooth) < lineClearance) {
        violations.push(`centerline point ${i} is closer than ${CENTERLINE_CLEARANCE_D}D to a tooth`)
      }
    }
    for (const peg of track.obstacles.pegs) {
      if (Math.hypot(point.x - peg.cx, point.y - peg.cy) - peg.radius < lineClearance) {
        violations.push(`centerline point ${i} is closer than ${CENTERLINE_CLEARANCE_D}D to a peg`)
      }
    }
    for (const diamond of track.obstacles.diamonds) {
      if (pointDiamondDistance(point.x, point.y, diamond) < lineClearance) {
        violations.push(`centerline point ${i} is closer than ${CENTERLINE_CLEARANCE_D}D to an island`)
      }
    }
  }

  // --- Finish: the finish-line gate must be well clear of every obstacle.
  const finishClearance = FINISH_MIN_OBSTACLE_D * D
  const finishY = track.finishLine.y
  for (const bar of track.obstacles.bars) {
    if (pointRectDistance(track.width / 2, finishY, bar) < finishClearance) {
      violations.push(`finish line is closer than ${FINISH_MIN_OBSTACLE_D}D to a bar`)
    }
  }
  for (const peg of track.obstacles.pegs) {
    if (Math.hypot(track.width / 2 - peg.cx, finishY - peg.cy) - peg.radius < finishClearance) {
      violations.push(`finish line is closer than ${FINISH_MIN_OBSTACLE_D}D to a peg`)
    }
  }

  return { valid: violations.length === 0, violations }
}
