/* Temporary Phase 2 verification script (headless). Not part of the app. */
import { RaceCamera } from './src/camera/RaceCamera'
import {
  DEFAULT_MARBLES,
  FIXED_TIME_STEP,
  HARD_RACE_LIMIT_S,
  MARBLE_RADIUS,
} from './src/config'
import { MARBLES } from './src/data'
import { MarbleRaceSimulation } from './src/physics/MarbleRaceSimulation'
import { PROTOTYPE_TRACK } from './src/track/track'

type Check = [string, boolean, string]
const results: Check[] = []
function check(name: string, ok: boolean, detail = ''): void {
  results.push([name, ok, detail])
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const DEFS = MARBLES.slice(0, DEFAULT_MARBLES).map((m) => ({ id: m.id }))
const sim = new MarbleRaceSimulation(DEFS)
const track = PROTOTYPE_TRACK

check(
  `exactly ${DEFAULT_MARBLES} marbles`,
  sim.marbles.length === DEFAULT_MARBLES,
  `${sim.marbles.length}`,
)

const initialPositions = sim.marbles
  .map((m) => `${m.x.toFixed(4)},${m.y.toFixed(4)}`)
  .join('|')

// 1. initial spawn sanity
let minPairDistance = Infinity
let spawnInsideGeometry = false
for (let i = 0; i < sim.marbles.length; i++) {
  const a = sim.marbles[i]
  if (
    a.x - MARBLE_RADIUS < 0 ||
    a.x + MARBLE_RADIUS > track.width ||
    a.y - MARBLE_RADIUS < 0 ||
    a.y + MARBLE_RADIUS > track.height
  ) {
    spawnInsideGeometry = true
  }
  for (let j = i + 1; j < sim.marbles.length; j++) {
    const b = sim.marbles[j]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    minPairDistance = Math.min(minPairDistance, dist)
  }
}
check(
  'no overlapping initial positions',
  minPairDistance > MARBLE_RADIUS * 2 + 0.01,
  `min pair distance ${minPairDistance.toFixed(2)} (diameter ${(MARBLE_RADIUS * 2).toFixed(2)})`,
)
check('no marble spawned inside geometry/walls', !spawnInsideGeometry)

// 2. ready-state camera + camera can never affect physics
const camera = new RaceCamera(track)
camera.resize(700, 520)
camera.snapToStart()

let readyViewOk = true
for (const marble of sim.marbles) {
  const s = camera.worldToScreen(marble.x, marble.y)
  if (s.x < 0 || s.x > 700 || s.y < 0 || s.y > 520) readyViewOk = false
}
check(`ready camera shows all ${DEFAULT_MARBLES} marbles`, readyViewOk)

const beforeCamera = sim.marbles
  .map((m) => `${m.x.toFixed(6)},${m.y.toFixed(6)},${m.prevX.toFixed(6)},${m.prevY.toFixed(6)}`)
  .join('|')
for (let i = 0; i < 300; i += 1) {
  camera.update(1 / 60, 'follow', sim.activeMarbles(), 1)
  sim.updateRenderPositions(0.5)
}
const afterCamera = sim.marbles
  .map((m) => `${m.x.toFixed(6)},${m.y.toFixed(6)},${m.prevX.toFixed(6)},${m.prevY.toFixed(6)}`)
  .join('|')
check('camera updates never move marbles', beforeCamera === afterCamera)

// 3. physics-driven race with camera verification

const finishEvents: { place: number; id: string; time: number }[] = []
sim.onFinish = (event) => {
  finishEvents.push({ place: event.place, id: event.marbleId, time: event.timeSec })
}
let completed = false
sim.onComplete = () => {
  completed = true
}

let steps = 0
let outOfBounds = 0
let leaderOffScreen = 0
let bunchedOffScreen = 0
let cameraWentInvalid = 0
const maxSteps = Math.ceil((HARD_RACE_LIMIT_S + 5) / FIXED_TIME_STEP)

while (!completed && steps < maxSteps) {
  sim.step(FIXED_TIME_STEP)
  sim.updateRenderPositions(0)
  camera.update(1 / 60, 'follow', sim.activeMarbles(), 1)
  steps += 1

  for (const marble of sim.marbles) {
    if (
      marble.x < -MARBLE_RADIUS - 0.6 ||
      marble.x > track.width + MARBLE_RADIUS + 0.6 ||
      marble.y < -MARBLE_RADIUS - 0.6 ||
      marble.y > track.height + MARBLE_RADIUS + 0.6 ||
      !Number.isFinite(marble.x) ||
      !Number.isFinite(marble.y)
    ) {
      outOfBounds += 1
    }
  }

  const view = camera.getView()
  if (!Number.isFinite(view.x) || !Number.isFinite(view.y) || !Number.isFinite(view.scale)) {
    cameraWentInvalid += 1
    continue
  }

  const active = sim.activeMarbles()
  if (active.length === 0) continue

  let lowest = active[0]
  for (const marble of active) {
    if (marble.renderY < lowest.renderY) lowest = marble
  }
  const leaderScreen = camera.worldToScreen(lowest.renderX, lowest.renderY)
  if (leaderScreen.x < -8 || leaderScreen.x > 708 || leaderScreen.y < -8 || leaderScreen.y > 528) {
    leaderOffScreen += 1
  }

  // When the active group is compact (spread + margins fits the widest view),
  // every marble must be framed.
  let spreadMinY = Infinity
  let spreadMaxY = -Infinity
  for (const marble of active) {
    spreadMinY = Math.min(spreadMinY, marble.renderY)
    spreadMaxY = Math.max(spreadMaxY, marble.renderY)
  }
  if (spreadMaxY - spreadMinY <= 40) {
    for (const marble of active) {
      const s = camera.worldToScreen(marble.renderX, marble.renderY)
      if (s.x < -8 || s.x > 708 || s.y < -8 || s.y > 528) bunchedOffScreen += 1
    }
  }
}

check('race reached a completed state', completed, `${steps} steps / ${(steps * FIXED_TIME_STEP).toFixed(1)}s sim`)
check('no marble left the track (no tunneling)', outOfBounds === 0, `${outOfBounds} out-of-bounds samples`)
check('camera never produced an invalid view', cameraWentInvalid === 0)
check('camera always kept the race leader on screen', leaderOffScreen === 0, `${leaderOffScreen} samples`)
check(
  'camera framed the whole group whenever the spread was compact',
  bunchedOffScreen === 0,
  `${bunchedOffScreen} off-screen samples`,
)

const finished = sim.marbles.filter((m) => m.status === 'finished')
const dnf = sim.marbles.filter((m) => m.status === 'dnf')
check(
  `all ${sim.marbles.length} marbles accounted for`,
  finished.length + dnf.length === sim.marbles.length,
  `${finished.length} finished, ${dnf.length} DNF`,
)
check(
  'finish events recorded in order',
  finishEvents.length === finished.length &&
    finishEvents.every((event, index) => event.place === index + 1),
  finishEvents.map((e) => `${e.place}:${e.id}@${e.time.toFixed(2)}s`).join(', '),
)
const times = finishEvents.map((e) => e.time)
const timesIncreasing = times.every((time, index) => index === 0 || time > times[index - 1])
check('finish times strictly increase', timesIncreasing)

// 4. reset restores the grid and can race again
sim.reset(DEFS)
camera.reset()
const resetPositions = sim.marbles
  .map((m) => `${m.x.toFixed(4)},${m.y.toFixed(4)}`)
  .join('|')
check('reset restores spawn positions', resetPositions === initialPositions)
check('reset clears records', sim.finishedCount() === 0 && sim.dnfCount() === 0 && sim.elapsed() === 0)

let completedAgain = false
sim.onComplete = () => {
  completedAgain = true
}
steps = 0
while (!completedAgain && steps < maxSteps) {
  sim.step(FIXED_TIME_STEP)
  steps += 1
}
check('second race also completes (no stale state)', completedAgain,
  `${steps} steps / ${(steps * FIXED_TIME_STEP).toFixed(1)}s sim`)

// 5. determinism: identical inputs and step counts produce identical states
const a = new MarbleRaceSimulation(DEFS)
const b = new MarbleRaceSimulation(DEFS)
for (let i = 0; i < 600; i++) a.step(FIXED_TIME_STEP)
for (let i = 0; i < 600; i++) b.step(FIXED_TIME_STEP)
const deterministic = a.marbles.every(
  (marble, index) =>
    Math.abs(marble.x - b.marbles[index].x) < 1e-12 &&
    Math.abs(marble.y - b.marbles[index].y) < 1e-12,
)
check(
  'physics is deterministic for identical step sequences',
  deterministic,
  `leaderY=${Math.min(...a.marbles.map((m) => m.y)).toFixed(2)} after 600 steps`,
)

const failed = results.filter(([, ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
