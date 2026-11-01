/**
 * Pure 2D geometry helpers shared by the track generator and its validator.
 *
 * Everything here is side-effect free and free of engine references, so the
 * generator can be reasoned about (and tested) as plain geometry. The physics
 * module turns the resulting data into Planck bodies; it never uses these.
 */

import type { TrackCircle, TrackDiamond, TrackRect } from './track'

export interface Point2 {
  x: number
  y: number
}

/** Rotates a point about the origin by `angleDeg` degrees. */
export function rotatePoint(x: number, y: number, angleDeg: number): Point2 {
  const angle = (angleDeg * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/** Clamps `value` into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** World-space corners of a (possibly rotated) rectangle, CCW from bottom-left. */
export function rectCorners(rect: TrackRect): Point2[] {
  const { cx, cy, halfW, halfH, angleDeg } = rect
  return [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ].map((p) => {
    const r = rotatePoint(p.x, p.y, angleDeg)
    return { x: cx + r.x, y: cy + r.y }
  })
}

/** Shortest distance from a point to an axis-aligned box. Zero inside. */
export function pointRectDistance(
  px: number,
  py: number,
  rect: TrackRect,
): number {
  const local = rotatePoint(px - rect.cx, py - rect.cy, -rect.angleDeg)
  const dx = Math.max(Math.abs(local.x) - rect.halfW, 0)
  const dy = Math.max(Math.abs(local.y) - rect.halfH, 0)
  return Math.hypot(dx, dy)
}

/** Point-in-rect test for a (possibly rotated) rectangle. */
export function pointInRect(px: number, py: number, rect: TrackRect): boolean {
  const local = rotatePoint(px - rect.cx, py - rect.cy, -rect.angleDeg)
  return Math.abs(local.x) <= rect.halfW && Math.abs(local.y) <= rect.halfH
}

/** True when a circle overlaps a (possibly rotated) rectangle. */
export function circleOverlapsRect(
  cx: number,
  cy: number,
  radius: number,
  rect: TrackRect,
): boolean {
  return pointRectDistance(cx, cy, rect) < radius
}

/** True when two circles overlap. */
export function circlesOverlap(
  ax: number,
  ay: number,
  aRadius: number,
  bx: number,
  by: number,
  bRadius: number,
): boolean {
  return Math.hypot(ax - bx, ay - by) < aRadius + bRadius
}

/** True when a circle overlaps a circle obstacle. */
export function circleOverlapsCircle(
  cx: number,
  cy: number,
  radius: number,
  circle: TrackCircle,
): boolean {
  return circlesOverlap(cx, cy, radius, circle.cx, circle.cy, circle.radius)
}

/** True when two circles are separated by at least `gap` units of clear space. */
export function circlesSeparatedBy(
  ax: number,
  ay: number,
  aRadius: number,
  bx: number,
  by: number,
  bRadius: number,
  gap: number,
): boolean {
  return Math.hypot(ax - bx, ay - by) >= aRadius + bRadius + gap
}

/**
 * World-space corners of a diamond island, CCW from the top point.
 * `halfW`/`halfH` are the distances from the centre to the side points and
 * the top/bottom points respectively.
 */
export function diamondCorners(diamond: TrackDiamond): Point2[] {
  const { cx, cy, halfW, halfH, angleDeg } = diamond
  return [
    { x: 0, y: halfH },
    { x: -halfW, y: 0 },
    { x: 0, y: -halfH },
    { x: halfW, y: 0 },
  ].map((p) => {
    const r = rotatePoint(p.x, p.y, angleDeg)
    return { x: cx + r.x, y: cy + r.y }
  })
}

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** True when a point lies inside a simple polygon (ray casting). */
export function pointInPolygon(px: number, py: number, points: readonly Point2[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]
    const b = points[j]
    const intersects =
      a.y > py !== b.y > py &&
      px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

/** Shortest distance from a point to a polygon edge. Zero inside. */
export function pointPolygonDistance(
  px: number,
  py: number,
  points: readonly Point2[],
): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY
  if (pointInPolygon(px, py, points)) return 0
  let nearest = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    nearest = Math.min(nearest, pointSegmentDistance(px, py, a.x, a.y, b.x, b.y))
  }
  return nearest
}

/** Shortest distance from a point to a diamond island. Zero inside. */
export function pointDiamondDistance(
  px: number,
  py: number,
  diamond: TrackDiamond,
): number {
  return pointPolygonDistance(px, py, diamondCorners(diamond))
}
