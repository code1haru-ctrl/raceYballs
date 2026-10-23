import {
  Box,
  Circle,
  World,
  type Body,
  type Contact,
  type ContactImpulse,
  type Fixture,
} from 'planck'
import {
  BAR_RESTITUTION,
  COLLISION_MIN_APPROACH_SPEED,
  COLLISION_SILENCE_AFTER_TELEPORT_S,
  FIXED_TIME_STEP,
  GRAVITY_Y,
  HARD_RACE_LIMIT_S,
  MARBLE_DENSITY,
  MARBLE_FRICTION,
  MARBLE_RADIUS,
  MARBLE_RESTITUTION,
  POSITION_ITERATIONS,
  TRACK_FRICTION,
  TRACK_RESTITUTION,
  VELOCITY_ITERATIONS,
} from '../config'
import type { MarbleStatus } from '../race/types'
import { PROTOTYPE_TRACK, type TrackData } from '../track/track'

export interface MarbleDefinition {
  id: string
}

/** Why a marble left the race without finishing. */
export type DnfReason = 'recovery-failed' | 'race-timeout'

export interface DnfEvent {
  marbleId: string
  reason: DnfReason
  timeSec: number
}

export interface MarbleRuntime {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  prevX: number
  prevY: number
  /** Interpolated position used for rendering only. */
  renderX: number
  renderY: number
  status: MarbleStatus
  place: number | null
  timeSec: number | null
}

/**
 * Plain snapshot of one marble, free of any rendering or engine references.
 * Returned by `advanceSteps` so simulations can be driven and inspected from
 * a plain Node process or a test runner.
 */
export interface MarbleState {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  finished: boolean
  /** True when the marble is out of the race without finishing. */
  dnf: boolean
  /** Position in the recorded finish order, or null if the marble did not finish. */
  finishOrder: number | null
  finishTime: number | null
}

export interface FinishEvent {
  place: number
  marbleId: string
  timeSec: number
}

/**
 * A physics contact worth reporting to the race event stream (Phase 5).
 * `impact` is the sum of the post-solve normal impulses; the audio layer
 * decides what level that maps to.
 */
export interface MarbleCollisionEvent {
  marbleId: string
  /** The other marble, or null when the contact was with track geometry. */
  otherId: string | null
  kind: 'marble' | 'track'
  impact: number
}

/**
 * Owns the Planck.js world for one race: static track geometry, ten dynamic
 * marbles, the finish-line sensor, finish-order recording and the Phase 3B
 * DNF rules. Positions come from the physics engine only; nothing in here
 * reads from the renderer, the camera, React, the DOM or Canvas.
 */
export class MarbleRaceSimulation {
  readonly marbles: MarbleRuntime[] = []
  readonly track: TrackData

  private world: World
  private bodies: Body[] = []
  private marbleIndexByBody = new Map<Body, number>()
  private finishFixture: Fixture | null = null
  private simTime = 0
  private finishedTotal = 0
  private dnfTotal = 0
  private completed = false

  onFinish: ((event: FinishEvent) => void) | null = null
  onDnf: ((event: DnfEvent) => void) | null = null
  onComplete: (() => void) | null = null
  /** Plain contact events; the physics world never imports audio. */
  onCollision: ((event: MarbleCollisionEvent) => void) | null = null

  /** Pre-solve approach speed per contact, consumed by the post-solve handler. */
  private approachSpeeds = new WeakMap<Contact, number>()
  /** Per-marble simulation time until which contacts are muted (teleports). */
  private collisionSilencedUntil: number[] = []

  constructor(defs: readonly MarbleDefinition[], track: TrackData = PROTOTYPE_TRACK) {
    this.track = track
    this.world = this.buildWorld(defs)
    for (let i = 0; i < defs.length; i += 1) {
      const slot = track.startPositions[i]
      this.marbles.push({
        id: defs[i].id,
        x: slot.x,
        y: slot.y,
        vx: 0,
        vy: 0,
        prevX: slot.x,
        prevY: slot.y,
        renderX: slot.x,
        renderY: slot.y,
        status: 'racing',
        place: null,
        timeSec: null,
      })
    }
  }

  elapsed(): number {
    return this.simTime
  }

  finishedCount(): number {
    return this.finishedTotal
  }

  dnfCount(): number {
    return this.dnfTotal
  }

  isCompleted(): boolean {
    return this.completed
  }

  /** Marbles that have not finished and are still influencing the race. */
  activeMarbles(): MarbleRuntime[] {
    const active: MarbleRuntime[] = []
    for (const marble of this.marbles) {
      if (marble.status === 'racing') active.push(marble)
    }
    return active
  }

  /** Plain marble states (positions, velocities and finish records). */
  marbleStates(): MarbleState[] {
    return this.marbles.map((marble) => ({
      id: marble.id,
      x: marble.x,
      y: marble.y,
      vx: marble.vx,
      vy: marble.vy,
      finished: marble.status === 'finished',
      dnf: marble.status === 'dnf',
      finishOrder: marble.place,
      finishTime: marble.timeSec,
    }))
  }

  /**
   * Advances the simulation by `steps` fixed timesteps and returns the marble
   * states afterwards. Stops early if the race completes.
   */
  advanceSteps(steps: number): MarbleState[] {
    for (let i = 0; i < steps && !this.completed; i += 1) {
      this.step(FIXED_TIME_STEP)
    }
    return this.marbleStates()
  }

  /** Interpolated draw positions between the last two physics steps. */
  updateRenderPositions(alpha: number): void {
    for (const marble of this.marbles) {
      marble.renderX = marble.prevX + (marble.x - marble.prevX) * alpha
      marble.renderY = marble.prevY + (marble.y - marble.prevY) * alpha
    }
  }

  /** Advances the world by exactly one fixed timestep. */
  step(dt: number): void {
    if (this.completed) return

    this.simTime += dt

    for (const marble of this.marbles) {
      marble.prevX = marble.x
      marble.prevY = marble.y
    }

    this.world.step(dt, VELOCITY_ITERATIONS, POSITION_ITERATIONS)

    for (let i = 0; i < this.marbles.length; i += 1) {
      const marble = this.marbles[i]
      const body = this.bodies[i]
      const position = body.getPosition()
      const velocity = body.getLinearVelocity()
      marble.x = position.x
      marble.y = position.y
      marble.vx = velocity.x
      marble.vy = velocity.y

      // Position-crossing fallback for the finish sensor. Both checks are
      // physics-derived; the per-marble guard keeps the record single.
      if (
        marble.status === 'racing' &&
        marble.prevY > this.track.finishLine.y &&
        marble.y <= this.track.finishLine.y
      ) {
        this.recordFinish(i)
      }
    }

    if (this.simTime >= HARD_RACE_LIMIT_S) {
      // The race hit its hard limit: every marble still on the track is a DNF.
      // No finishing position is invented for them.
      for (let i = 0; i < this.marbles.length; i += 1) {
        this.markDnf(i, 'race-timeout')
      }
    }

    if (!this.completed && this.finishedTotal + this.dnfTotal >= this.marbles.length) {
      this.completed = true
      this.onComplete?.()
    }
  }

  /**
   * Takes a marble out of the race without a finishing position.
   *
   * The body is frozen and stops colliding so a retired marble can neither
   * block a racer nor fall through the track. Returns false when the marble
   * was not racing (it already finished or was already a DNF).
   */
  markDnf(index: number, reason: DnfReason): boolean {
    const marble = this.marbles[index]
    const body = this.bodies[index]
    if (!marble || marble.status !== 'racing') return false

    marble.status = 'dnf'
    this.dnfTotal += 1

    if (body) {
      body.setType('static')
      const fixture = body.getFixtureList()
      if (fixture) body.destroyFixture(fixture)
    }

    this.onDnf?.({ marbleId: marble.id, reason, timeSec: this.simTime })
    return true
  }

  /**
   * Moves a marble to a new spot on the track (recovery).
   *
   * The body is re-placed, its velocity is zeroed and it is woken up so the
   * engine keeps simulating it right away. Returns false when the marble is
   * not racing.
   */
  teleportMarble(index: number, x: number, y: number): boolean {
    const body = this.bodies[index]
    const marble = this.marbles[index]
    if (!body || !marble || marble.status !== 'racing') return false

    body.setTransform({ x, y }, body.getAngle())
    body.setLinearVelocity({ x: 0, y: 0 })
    body.setAwake(true)

    marble.x = x
    marble.y = y
    marble.vx = 0
    marble.vy = 0
    marble.prevX = x
    marble.prevY = y
    marble.renderX = x
    marble.renderY = y

    // Recovery moves a marble outside the normal flow of the race. Its
    // contacts for the next fraction of a simulation second are ignored so a
    // teleport can never be heard as a collision.
    this.collisionSilencedUntil[index] =
      this.simTime + COLLISION_SILENCE_AFTER_TELEPORT_S
    return true
  }

  /**
   * Rebuilds the physics world from scratch and clears every race record.
   * Used by Reset so repeated races never inherit stale bodies or listeners.
   */
  reset(defs: readonly MarbleDefinition[]): void {
    this.world = this.buildWorld(defs)
    this.simTime = 0
    this.finishedTotal = 0
    this.dnfTotal = 0
    this.completed = false
    for (let i = 0; i < this.marbles.length; i += 1) {
      const marble = this.marbles[i]
      const slot = this.track.startPositions[i]
      marble.id = defs[i].id
      marble.x = slot.x
      marble.y = slot.y
      marble.vx = 0
      marble.vy = 0
      marble.prevX = slot.x
      marble.prevY = slot.y
      marble.renderX = slot.x
      marble.renderY = slot.y
      marble.status = 'racing'
      marble.place = null
      marble.timeSec = null
    }
  }

  private buildWorld(defs: readonly MarbleDefinition[]): World {
    const track = this.track
    const world = new World({ gravity: { x: 0, y: GRAVITY_Y } })
    this.bodies = []
    this.marbleIndexByBody = new Map<Body, number>()
    this.finishFixture = null
    this.approachSpeeds = new WeakMap<Contact, number>()
    this.collisionSilencedUntil = new Array(defs.length).fill(0)

    for (const wall of track.walls) {
      const body = world.createBody({ position: { x: wall.cx, y: wall.cy } })
      body.createFixture({
        shape: new Box(wall.halfW, wall.halfH),
        friction: TRACK_FRICTION,
        restitution: TRACK_RESTITUTION,
      })
    }

    for (const bar of track.obstacles.bars) {
      const body = world.createBody({
        position: { x: bar.cx, y: bar.cy },
        angle: (bar.angleDeg * Math.PI) / 180,
      })
      body.createFixture({
        shape: new Box(bar.halfW, bar.halfH),
        friction: TRACK_FRICTION,
        restitution: BAR_RESTITUTION,
      })
    }

    for (const peg of track.obstacles.pegs) {
      const body = world.createBody({ position: { x: peg.cx, y: peg.cy } })
      body.createFixture({
        shape: new Circle(peg.radius),
        friction: TRACK_FRICTION,
        restitution: BAR_RESTITUTION,
      })
    }

    const sensor = track.finishLine.sensor
    const sensorBody = world.createBody({ position: { x: sensor.cx, y: sensor.cy } })
    this.finishFixture = sensorBody.createFixture({
      shape: new Box(sensor.halfW, sensor.halfH),
      isSensor: true,
    })

    world.on('begin-contact', this.handleBeginContact)
    world.on('pre-solve', this.handlePreSolve)
    world.on('post-solve', this.handlePostSolve)

    for (let i = 0; i < defs.length; i += 1) {
      const slot = track.startPositions[i]
      const body = world.createBody({
        type: 'dynamic',
        position: { x: slot.x, y: slot.y },
      })
      body.createFixture({
        shape: new Circle(MARBLE_RADIUS),
        density: MARBLE_DENSITY,
        friction: MARBLE_FRICTION,
        restitution: MARBLE_RESTITUTION,
      })
      this.bodies.push(body)
      this.marbleIndexByBody.set(body, i)
    }

    return world
  }

  private readonly handleBeginContact = (contact: Contact): void => {
    const fixtureA = contact.getFixtureA()
    const fixtureB = contact.getFixtureB()

    let marbleFixture: Fixture
    if (fixtureA === this.finishFixture) {
      marbleFixture = fixtureB
    } else if (fixtureB === this.finishFixture) {
      marbleFixture = fixtureA
    } else {
      return
    }

    const index = this.marbleIndexByBody.get(marbleFixture.getBody())
    if (index !== undefined) this.recordFinish(index)
  }

  /**
   * Records how fast the two bodies approached each other along the contact
   * normal. This distinguishes a real hit from a resting/stacked contact whose
   * post-solve impulse is just the support impulse of the marbles above it.
   */
  private readonly handlePreSolve = (contact: Contact): void => {
    const normal = contact.getWorldManifold(null)?.normal
    if (!normal) {
      this.approachSpeeds.delete(contact)
      return
    }

    const bodyA = contact.getFixtureA().getBody()
    const bodyB = contact.getFixtureB().getBody()
    const velocityA = bodyA.getLinearVelocity()
    const velocityB = bodyB.getLinearVelocity()
    const relativeNormalSpeed =
      (velocityA.x - velocityB.x) * normal.x +
      (velocityA.y - velocityB.y) * normal.y

    this.approachSpeeds.set(contact, Math.max(0, relativeNormalSpeed))
  }

  private readonly handlePostSolve = (
    contact: Contact,
    impulse: ContactImpulse,
  ): void => {
    const approachSpeed = this.approachSpeeds.get(contact) ?? 0
    this.approachSpeeds.delete(contact)
    if (this.completed) return

    const fixtureA = contact.getFixtureA()
    const fixtureB = contact.getFixtureB()
    if (fixtureA === this.finishFixture || fixtureB === this.finishFixture) {
      return
    }

    const indexA = this.marbleIndexByBody.get(fixtureA.getBody())
    const indexB = this.marbleIndexByBody.get(fixtureB.getBody())
    if (indexA === undefined && indexB === undefined) return

    if (approachSpeed < COLLISION_MIN_APPROACH_SPEED) return

    let impact = 0
    for (const normalImpulse of impulse.normalImpulses) {
      impact += Math.abs(normalImpulse)
    }
    if (impact <= 0) return

    let index: number
    let otherIndex: number | undefined
    let kind: 'marble' | 'track'

    if (indexA !== undefined && indexB !== undefined) {
      if (
        this.isCollisionSilenced(indexA) ||
        this.isCollisionSilenced(indexB)
      ) {
        return
      }

      const statusA = this.marbles[indexA].status
      const statusB = this.marbles[indexB].status
      if (statusA !== 'racing' && statusB !== 'racing') return

      index = statusA === 'racing' ? indexA : indexB
      otherIndex = index === indexA ? indexB : indexA
      kind = 'marble'
    } else {
      index = indexA ?? indexB!
      if (this.isCollisionSilenced(index)) return
      if (this.marbles[index].status !== 'racing') return
      kind = 'track'
    }

    this.onCollision?.({
      marbleId: this.marbles[index].id,
      otherId: otherIndex === undefined ? null : this.marbles[otherIndex].id,
      kind,
      impact,
    })
  }

  private isCollisionSilenced(index: number): boolean {
    return this.simTime < (this.collisionSilencedUntil[index] ?? 0)
  }

  private recordFinish(index: number): void {
    const marble = this.marbles[index]
    if (marble.status !== 'racing') return

    this.finishedTotal += 1
    marble.status = 'finished'
    marble.place = this.finishedTotal
    marble.timeSec = this.simTime
    this.onFinish?.({
      place: marble.place,
      marbleId: marble.id,
      timeSec: marble.timeSec,
    })
  }
}
