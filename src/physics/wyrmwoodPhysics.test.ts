import { describe, expect, it } from 'vitest'
import { MarbleRaceSimulation } from './MarbleRaceSimulation'
import { wyrmwoodCourse, WW_FLOOR_LEFT, WW_FLOOR_RIGHT } from '../track/generate'
import { buildTrack } from '../track/generate'
import { MARBLE_RADIUS } from '../config'
import { pointRectDistance } from '../track/geometry'

describe('Wyrmwood physics', () => {
  it('places ramp gaps at the low end', () => {
    for (let seed = 1; seed <= 1; seed += 1) {
      const course = wyrmwoodCourse(seed)
      for (const ramp of course.ramps) {
        const highX = ramp.xStart
        const lowX = ramp.xEnd
        const isFromLeft = highX < lowX
        const lowWall = isFromLeft ? WW_FLOOR_RIGHT : WW_FLOOR_LEFT
        const highWall = isFromLeft ? WW_FLOOR_LEFT : WW_FLOOR_RIGHT
        
        expect(Math.abs(highX - highWall)).toBeLessThan(0.1)
        expect(Math.abs(lowX - lowWall)).toBeGreaterThan(2) // Gap exists
      }
    }
  })

  it('marble dropped on any ramp rolls through the gap', () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const track = buildTrack('wyrmwood', seed, 1)
      const course = wyrmwoodCourse(seed)
      for (const ramp of course.ramps) {
        const sim = new MarbleRaceSimulation([{id: 'm1'}], track)
        const midX = (ramp.xStart + ramp.xEnd) / 2
        const midY = (ramp.yStart + ramp.yEnd) / 2
        sim.teleportMarble(0, midX, midY + MARBLE_RADIUS + 1)
        
        // Simulate until fallen
        let fallenOrFinished = false
        for(let i=0; i<600; i++){
          sim.step(1/60)
          if (sim.marbles[0].y < ramp.yEnd - MARBLE_RADIUS*3 || sim.marbles[0].status === 'finished') {
            fallenOrFinished = true
            break
          }
        }
        expect(fallenOrFinished).toBe(true)
      }
    }
  })

  it('no marble center is ever inside a solid obstacle during a full race', () => {
    for (let count = 2; count <= 20; count += 10) {
      const track = buildTrack('wyrmwood', 1, count)
      const sim = new MarbleRaceSimulation(Array(count).fill({id:'m'}), track)
      for (let i = 0; i < 2000; i += 1) {
        sim.step(1/60)
        for (const marble of sim.marbles) {
           for (const bar of track.obstacles.bars) {
             expect(pointRectDistance(marble.x, marble.y, bar)).toBeGreaterThanOrEqual(0.001)
           }
           for (const peg of track.obstacles.pegs) {
             expect(Math.hypot(marble.x - peg.cx, marble.y - peg.cy)).toBeGreaterThanOrEqual(peg.radius + 0.001)
           }
        }
      }
    }
  })
})
