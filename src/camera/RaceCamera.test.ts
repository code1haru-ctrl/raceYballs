import { describe, expect, it } from 'vitest'
import { projectToScreen, RaceCamera, type CameraView } from './RaceCamera'
import type { MarbleRuntime } from '../physics/MarbleRaceSimulation'
import { applyWorldTransform } from '../render/raceRenderer'
import { buildTrack, DEFAULT_SEEDS } from '../track/generate'

/** The canvas sizes the renderer has to look right in. */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 700, height: 520 },
  { width: 1400, height: 950 },
  { width: 1900, height: 900 },
]

const TRACK = buildTrack('neon-circuit', DEFAULT_SEEDS['neon-circuit'])

/** A racing group spread down the course, roughly where the marbles are. */
function group(): MarbleRuntime[] {
  return [
    { id: 'a', x: 12, y: 118, vx: 0, vy: 0, prevX: 12, prevY: 118, renderX: 12, renderY: 118, status: 'racing', place: null, timeSec: null },
    { id: 'b', x: 20, y: 110, vx: 0, vy: 0, prevX: 20, prevY: 110, renderX: 20, renderY: 110, status: 'racing', place: null, timeSec: null },
    { id: 'c', x: 28, y: 96, vx: 0, vy: 0, prevX: 28, prevY: 96, renderX: 28, renderY: 96, status: 'racing', place: null, timeSec: null },
  ]
}

/** Runs the camera until it settles on the group. */
function settle(camera: RaceCamera, viewport: { width: number; height: number }): void {
  camera.resize(viewport.width, viewport.height)
  for (let step = 0; step < 240; step += 1) {
    camera.update(1 / 60, 'follow', group(), 1)
  }
}

/** A canvas transform matrix, in the [a, b, c, d, e, f] form Canvas 2D uses. */
type Matrix = [number, number, number, number, number, number]

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

/** Records the transform calls the renderer makes on the canvas. */
function recordingContext(): { ctx: CanvasRenderingContext2D; getMatrix: () => Matrix } {
  let matrix: Matrix = [1, 0, 0, 1, 0, 0]
  const ctx = {
    translate(x: number, y: number) {
      const m: Matrix = [1, 0, 0, 1, x, y]
      matrix = multiply(matrix, m)
    },
    scale(x: number, y: number) {
      const m: Matrix = [x, 0, 0, y, 0, 0]
      matrix = multiply(matrix, m)
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, getMatrix: () => matrix }
}

function applyMatrix(matrix: Matrix, x: number, y: number): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  }
}

describe('camera viewport', () => {
  it('keeps its viewport when the track changes', () => {
    const camera = new RaceCamera(TRACK)
    camera.resize(1400, 950)

    const other = buildTrack('chaos-canyon', DEFAULT_SEEDS['chaos-canyon'])
    camera.setTrack(other)

    expect(camera.viewport).toEqual({ width: 1400, height: 950 })
  })

  it('still frames the group after the track changes', () => {
    const camera = new RaceCamera(TRACK)
    camera.resize(1400, 950)
    camera.setTrack(buildTrack('chaos-canyon', DEFAULT_SEEDS['chaos-canyon']))

    for (let step = 0; step < 240; step += 1) {
      camera.update(1 / 60, 'follow', group(), 1)
    }

    const view = camera.getView()
    expect(view.scale).toBeGreaterThan(2)
    for (const marble of group()) {
      const screen = projectToScreen(view, camera.viewport, marble.renderX, marble.renderY)
      expect(screen.x).toBeGreaterThan(0)
      expect(screen.x).toBeLessThan(1400)
      expect(screen.y).toBeGreaterThan(0)
      expect(screen.y).toBeLessThan(950)
    }
  })
})

describe('camera framing', () => {
  for (const viewport of VIEWPORTS) {
    it(`frames the group on a ${viewport.width}x${viewport.height} canvas`, () => {
      const camera = new RaceCamera(TRACK)
      settle(camera, viewport)

      const view = camera.getView()
      expect(view.scale).toBeGreaterThan(2)
      expect(Number.isFinite(view.x)).toBe(true)
      expect(Number.isFinite(view.y)).toBe(true)

      for (const marble of group()) {
        const screen = projectToScreen(view, viewport, marble.renderX, marble.renderY)
        expect(screen.x).toBeGreaterThan(-40)
        expect(screen.x).toBeLessThan(viewport.width + 40)
        expect(screen.y).toBeGreaterThan(-40)
        expect(screen.y).toBeLessThan(viewport.height + 40)
      }
    })

    it(`keeps the track centred on a ${viewport.width}x${viewport.height} canvas`, () => {
      const camera = new RaceCamera(TRACK)
      settle(camera, viewport)

      const view = camera.getView()
      const left = projectToScreen(view, viewport, 0, 0).x
      const right = projectToScreen(view, viewport, TRACK.width, 0).x
      const trackCentre = (left + right) / 2

      expect(Math.abs(trackCentre - viewport.width / 2)).toBeLessThan(40)
      // The track has to fill a useful part of the canvas, not shrink into it.
      expect(right - left).toBeGreaterThan(viewport.width * 0.25)
    })
  }
})

describe('world to screen transform', () => {
  it('matches the transform the renderer applies to the canvas', () => {
    const view: CameraView = { x: 20, y: 96, scale: 12.5 }
    const viewport = { width: 1400, height: 950 }

    const { ctx, getMatrix } = recordingContext()
    applyWorldTransform(ctx, view, viewport)

    const matrix = getMatrix()
    // The renderer's transform is: translate(width/2, height/2) -> scale(scale, -scale)
    // -> translate(-view.x, -view.y). A world point becomes
    // ((x - view.x) * scale + width/2, height/2 - (y - view.y) * scale), which is
    // exactly what projectToScreen produces.
    const translate1 = multiply([1, 0, 0, 1, 0, 0], [1, 0, 0, 1, viewport.width / 2, viewport.height / 2])
    const scale1 = multiply(translate1, [view.scale, 0, 0, -view.scale, 0, 0])
    const expected = multiply(scale1, [1, 0, 0, 1, -view.x, -view.y])

    for (let i = 0; i < 6; i += 1) {
      expect(matrix[i]).toBeCloseTo(expected[i], 9)
    }

    for (const [worldX, worldY] of [
      [0, 0],
      [20, 73],
      [40, 146],
      [13.5, 99.25],
    ]) {
      const throughTransform = applyMatrix(matrix, worldX, worldY)
      const throughHelper = projectToScreen(view, viewport, worldX, worldY)
      expect(throughHelper.x).toBeCloseTo(throughTransform.x, 9)
      expect(throughHelper.y).toBeCloseTo(throughTransform.y, 9)
    }
  })

  it('places the camera and the renderer on the same pixel', () => {
    const camera = new RaceCamera(TRACK)
    settle(camera, { width: 1900, height: 900 })

    const view = camera.getView()
    for (const marble of group()) {
      const fromCamera = camera.worldToScreen(marble.renderX, marble.renderY)
      const fromRenderer = projectToScreen(view, camera.viewport, marble.renderX, marble.renderY)
      expect(fromCamera.x).toBeCloseTo(fromRenderer.x, 9)
      expect(fromCamera.y).toBeCloseTo(fromRenderer.y, 9)
    }
  })
})
