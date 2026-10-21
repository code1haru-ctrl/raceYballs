/**
 * Pure 2D geometry helpers shared by the track generator and its validator.
 *
 * Everything here is side-effect free and free of engine references, so the
 * generator can be reasoned about (and tested) as plain geometry. The physics
 * module turns the resulting data into Planck bodies; it never uses these.
 */

import type { TrackCircle, TrackRect } from './track'

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
