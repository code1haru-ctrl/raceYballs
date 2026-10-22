import {
  projectToScreen,
  type CameraView,
  type Viewport,
} from '../camera/RaceCamera'
import type { RaceCamera } from '../camera/RaceCamera'
import { MARBLE_RADIUS } from '../config'
import { MARBLES } from '../data'
import type { MarbleRaceSimulation } from '../physics/MarbleRaceSimulation'
import type { RaceState } from '../race/types'
import type { TrackData } from '../track/track'

export interface RenderLayout {
  width: number
  height: number
  dpr: number
}

export interface RenderTheme {
  accent: string
}

export interface RenderStatusInfo {
  state: RaceState
  elapsedSec: number
  finishedCount: number
  dnfCount: number
  speedLabel: string
}

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  const parsed = Number.parseInt(full, 16)
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 }
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Mixes a hex colour toward white (amount > 0) or black (amount < 0). */
function shade(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex)
  const target = amount >= 0 ? 255 : 0
  const ratio = Math.abs(amount)
  const mix = (channel: number) => Math.round(channel + (target - channel) * ratio)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

const BACKGROUND_TOP = '#070911'
const BACKGROUND_BOTTOM = '#05060c'
const MONO_FONT = '"Cascadia Code", Consolas, ui-monospace, monospace'
const MARBLE_BY_ID = new Map(MARBLES.map((marble) => [marble.id, marble]))

/**
 * Builds the canvas transform that maps world coordinates onto the canvas.
 *
 * The mapping is the exact inverse of `projectToScreen`: a world point drawn
 * through this transform lands on the pixel `projectToScreen` reports, so
 * labels, numbers and the marbles themselves always agree.
 */
export function applyWorldTransform(
  ctx: CanvasRenderingContext2D,
  view: CameraView,
  viewport: Viewport,
): void {
  ctx.translate(viewport.width / 2, viewport.height / 2)
  ctx.scale(view.scale, -view.scale)
  ctx.translate(-view.x, -view.y)
}

/**
 * Draws one frame of the race with Canvas 2D.
 *
 * Positions come from the physics engine (already interpolated by the caller)
 * and are transformed by the camera. This module has no write access to the
 * simulation, so rendering can never affect race outcomes.
 */
export function drawRace(
  ctx: CanvasRenderingContext2D,
  sim: MarbleRaceSimulation,
  camera: RaceCamera,
  layout: RenderLayout,
  theme: RenderTheme,
  status: RenderStatusInfo,
): void {
  const { width, height, dpr } = layout
  if (width <= 0 || height <= 0) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  drawBackground(ctx, width, height, theme.accent)

  const view = camera.getView()
  ctx.save()
  applyWorldTransform(ctx, view, { width, height })
  drawTrackInterior(ctx, sim.track, theme.accent, view.scale)
  drawStartAndFinish(ctx, sim.track, theme.accent, view.scale)
  drawObstacles(ctx, sim.track, theme.accent, view.scale)
  drawMarbles(ctx, sim)
  ctx.restore()

  drawWorldLabels(ctx, camera, sim, layout, theme.accent)
  drawHud(ctx, width, height, theme, status)
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, BACKGROUND_TOP)
  gradient.addColorStop(1, BACKGROUND_BOTTOM)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  const glowTop = ctx.createRadialGradient(
    width * 0.5,
    -height * 0.1,
    0,
    width * 0.5,
    -height * 0.1,
    height * 0.7,
  )
  glowTop.addColorStop(0, rgba(accent, 0.1))
  glowTop.addColorStop(1, rgba(accent, 0))
  ctx.fillStyle = glowTop
  ctx.fillRect(0, 0, width, height)

  const glowBottom = ctx.createRadialGradient(
    width * 0.5,
    height * 1.05,
    0,
    width * 0.5,
    height * 1.05,
    height * 0.6,
  )
  glowBottom.addColorStop(0, 'rgba(169, 123, 255, 0.08)')
  glowBottom.addColorStop(1, 'rgba(169, 123, 255, 0)')
  ctx.fillStyle = glowBottom
  ctx.fillRect(0, 0, width, height)
}

function drawTrackInterior(
  ctx: CanvasRenderingContext2D,
  track: TrackData,
  accent: string,
  unit: number,
): void {
  const { width, height } = track

  const floorGradient = ctx.createLinearGradient(0, height, 0, 0)
  floorGradient.addColorStop(0, 'rgba(12, 16, 28, 0.9)')
  floorGradient.addColorStop(1, 'rgba(7, 9, 17, 0.9)')
  ctx.fillStyle = floorGradient
  ctx.fillRect(0, 0, width, height)

  ctx.lineWidth = 1 / unit
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
  ctx.beginPath()
  for (let x = 10; x < width; x += 10) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (let y = 10; y < height; y += 10) {
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()

  ctx.fillStyle = 'rgba(13, 16, 26, 0.92)'
  ctx.beginPath()
  for (const wall of track.walls) {
    ctx.rect(
      wall.cx - wall.halfW,
      wall.cy - wall.halfH,
      wall.halfW * 2,
      wall.halfH * 2,
    )
  }
  ctx.fill()

  ctx.strokeStyle = rgba(accent, 0.14)
  ctx.lineWidth = 6 / unit
  strokeWallOutlines(ctx, track)
  ctx.strokeStyle = rgba(accent, 0.7)
  ctx.lineWidth = 1.6 / unit
  strokeWallOutlines(ctx, track)
}

function strokeWallOutlines(ctx: CanvasRenderingContext2D, track: TrackData): void {
  ctx.beginPath()
  for (const wall of track.walls) {
    ctx.rect(
      wall.cx - wall.halfW,
      wall.cy - wall.halfH,
      wall.halfW * 2,
      wall.halfH * 2,
    )
  }
  ctx.stroke()
}

function drawStartAndFinish(
  ctx: CanvasRenderingContext2D,
  track: TrackData,
  accent: string,
  unit: number,
): void {
  const { width } = track
  const finish = track.finishLine

  ctx.fillStyle = rgba(accent, 0.06)
  ctx.fillRect(
    track.startZone.minX,
    track.startZone.minY,
    track.startZone.maxX - track.startZone.minX,
    track.startZone.maxY - track.startZone.minY,
  )
  drawCheckeredBand(ctx, track.startLineY - 0.6, track.startLineY + 0.6, width, 10, 0.85, unit)

  ctx.fillStyle = rgba(accent, 0.08)
  ctx.fillRect(
    finish.zone.minX,
    finish.zone.minY,
    finish.zone.maxX - finish.zone.minX,
    finish.zone.maxY - finish.zone.minY,
  )
  drawCheckeredBand(ctx, finish.y - 1.4, finish.y + 1.4, width, 14, 0.95, unit)

  ctx.strokeStyle = 'rgba(233, 237, 248, 0.55)'
  ctx.lineWidth = 1.4 / unit
  ctx.beginPath()
  ctx.moveTo(0, finish.y)
  ctx.lineTo(width, finish.y)
  ctx.stroke()
}

function drawCheckeredBand(
  ctx: CanvasRenderingContext2D,
  minY: number,
  maxY: number,
  width: number,
  cells: number,
  alpha: number,
  unit: number,
): void {
  const cellWidth = width / cells
  const cellHeight = (maxY - minY) / 2
  ctx.save()
  ctx.globalAlpha = alpha
  for (let column = 0; column < cells; column += 1) {
    ctx.fillStyle = column % 2 === 0 ? '#e9edf8' : '#0b0e16'
    ctx.fillRect(column * cellWidth, minY, cellWidth, cellHeight)
    ctx.fillStyle = column % 2 === 0 ? '#0b0e16' : '#e9edf8'
    ctx.fillRect(column * cellWidth, minY + cellHeight, cellWidth, cellHeight)
  }
  ctx.restore()
  ctx.strokeStyle = 'rgba(233, 237, 248, 0.25)'
  ctx.lineWidth = 1 / unit
  ctx.strokeRect(0, minY, width, maxY - minY)
}

function drawObstacles(
  ctx: CanvasRenderingContext2D,
  track: TrackData,
  accent: string,
  unit: number,
): void {
  for (const bar of track.obstacles.bars) {
    ctx.save()
    ctx.translate(bar.cx, bar.cy)
    ctx.rotate((-bar.angleDeg * Math.PI) / 180)
    ctx.fillStyle = 'rgba(16, 20, 34, 0.95)'
    ctx.fillRect(-bar.halfW, -bar.halfH, bar.halfW * 2, bar.halfH * 2)
    ctx.strokeStyle = rgba(accent, 0.16)
    ctx.lineWidth = 6 / unit
    ctx.strokeRect(-bar.halfW, -bar.halfH, bar.halfW * 2, bar.halfH * 2)
    ctx.strokeStyle = rgba(accent, 0.85)
    ctx.lineWidth = 1.5 / unit
    ctx.strokeRect(-bar.halfW, -bar.halfH, bar.halfW * 2, bar.halfH * 2)
    ctx.restore()
  }

  for (const peg of track.obstacles.pegs) {
    ctx.beginPath()
    ctx.arc(peg.cx, peg.cy, peg.radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(16, 20, 34, 0.95)'
    ctx.fill()
    ctx.strokeStyle = rgba(accent, 0.18)
    ctx.lineWidth = 6 / unit
    ctx.stroke()
    ctx.strokeStyle = rgba(accent, 0.85)
    ctx.lineWidth = 1.5 / unit
    ctx.stroke()
  }
}

function drawMarbles(ctx: CanvasRenderingContext2D, sim: MarbleRaceSimulation): void {
  for (const marble of sim.marbles) {
    const definition = MARBLE_BY_ID.get(marble.id)
    if (!definition) continue

    const alpha =
      marble.status === 'racing' ? 1 : marble.status === 'finished' ? 0.55 : 0.35
    ctx.save()
    ctx.globalAlpha = alpha

    ctx.beginPath()
    ctx.arc(marble.renderX, marble.renderY, MARBLE_RADIUS * 2.1, 0, Math.PI * 2)
    ctx.fillStyle = rgba(definition.color, 0.12)
    ctx.fill()

    const gradient = ctx.createRadialGradient(
      marble.renderX - MARBLE_RADIUS * 0.35,
      marble.renderY + MARBLE_RADIUS * 0.4,
      MARBLE_RADIUS * 0.1,
      marble.renderX,
      marble.renderY,
      MARBLE_RADIUS,
    )
    gradient.addColorStop(0, shade(definition.color, 0.65))
    gradient.addColorStop(0.45, definition.color)
    gradient.addColorStop(1, shade(definition.color, -0.55))

    ctx.beginPath()
    ctx.arc(marble.renderX, marble.renderY, MARBLE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.lineWidth = 0.09
    ctx.stroke()
    ctx.restore()
  }
}

function drawWorldLabels(
  ctx: CanvasRenderingContext2D,
  camera: RaceCamera,
  sim: MarbleRaceSimulation,
  layout: RenderLayout,
  accent: string,
): void {
  const track = sim.track
  const { width, height } = layout
  const view = camera.getView()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 10px ${MONO_FONT}`

  const start = camera.worldToScreen(track.width / 2, track.startLineY + 1.8)
  if (start.y > -12 && start.y < height + 12) {
    ctx.fillStyle = rgba(accent, 0.9)
    ctx.fillText('START', start.x, start.y)
  }

  const finish = camera.worldToScreen(track.width / 2, track.finishLine.y + 3.4)
  if (finish.y > -12 && finish.y < height + 12) {
    ctx.fillStyle = 'rgba(233, 237, 248, 0.8)'
    ctx.fillText('FINISH', finish.x, finish.y)
  }

  const showNames = view.scale >= camera.labelThreshold

  for (let index = 0; index < sim.marbles.length; index += 1) {
    const marble = sim.marbles[index]
    const definition = MARBLE_BY_ID.get(marble.id)
    if (!definition) continue

    const screen = projectToScreen(view, layout, marble.renderX, marble.renderY)
    if (
      screen.x < -40 ||
      screen.x > width + 40 ||
      screen.y < -40 ||
      screen.y > height + 40
    ) {
      continue
    }

    const radiusPx = MARBLE_RADIUS * view.scale

    if (radiusPx >= 7) {
      ctx.font = `700 ${Math.max(9, Math.round(radiusPx * 0.85))}px ${MONO_FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(5, 6, 10, 0.85)'
      ctx.fillText(String(index + 1), screen.x, screen.y)
    }

    if (showNames) {
      ctx.font = `500 10px ${MONO_FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
      ctx.shadowBlur = 4
      ctx.fillStyle = definition.color
      ctx.fillText(definition.name, screen.x, screen.y + radiusPx + 4)
      ctx.shadowBlur = 0
    }
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: RenderTheme,
  status: RenderStatusInfo,
): void {
  let text: string
  let dotColor: string
  switch (status.state) {
    case 'Ready':
      text = 'READY · PRESS START RACE'
      dotColor = '#2ce9ff'
      break
    case 'Running':
      text = `RACING · ${status.finishedCount}/10 FINISHED · ${status.elapsedSec.toFixed(1)}S · ${status.speedLabel}`
      dotColor = theme.accent
      break
    case 'Completed':
      text = `COMPLETED · ${status.finishedCount} FINISHED · ${status.dnfCount} DNF`
      dotColor = '#8df25c'
      break
  }

  const paddingX = 12
  const pillHeight = 26
  const margin = 12
  ctx.font = `600 10px ${MONO_FONT}`
  const pillWidth = Math.min(ctx.measureText(text).width + 44, width - margin * 2)

  ctx.fillStyle = 'rgba(6, 8, 14, 0.78)'
  roundRect(ctx, margin, margin, pillWidth, pillHeight, 13)
  ctx.fill()
  ctx.strokeStyle = rgba(theme.accent, 0.35)
  ctx.lineWidth = 1
  roundRect(ctx, margin, margin, pillWidth, pillHeight, 13)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(margin + paddingX + 3, margin + pillHeight / 2, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = dotColor
  ctx.fill()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(233, 237, 248, 0.92)'
  ctx.fillText(
    text,
    margin + paddingX + 14,
    margin + pillHeight / 2 + 0.5,
    pillWidth - paddingX - 18,
  )

  if (status.state === 'Completed') {
    const banner = 'RACE COMPLETE · SEE RESULTS BELOW'
    ctx.font = `600 11px ${MONO_FONT}`
    const bannerWidth = Math.min(ctx.measureText(banner).width + 36, width - 48)
    const bannerX = (width - bannerWidth) / 2
    const bannerY = height - 52
    ctx.fillStyle = 'rgba(6, 8, 14, 0.8)'
    roundRect(ctx, bannerX, bannerY, bannerWidth, 30, 15)
    ctx.fill()
    ctx.strokeStyle = 'rgba(141, 242, 92, 0.45)'
    roundRect(ctx, bannerX, bannerY, bannerWidth, 30, 15)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(233, 237, 248, 0.9)'
    ctx.fillText(banner, width / 2, bannerY + 15)
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
