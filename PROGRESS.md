# Progress: Phase 7B - Wyrmwood Switchback Redesign

## Checklist

- [x] Old tracks removed
- [x] Four track definitions with centerlines and `DEFAULT_SEEDs`
- [x] New geometry types defined (diamonds, ring pegs, angled bars, concave walls)
- [x] Per-track start grids with count-10 pins
- [ ] Validation for the new shapes (diamonds, rings, concave walls)
- [x] Selector UI with four cards and previews
- [ ] Spinner mount points on Ironhallow and Ashenmoor
- [x] Tests for track generation, start grid and seeded courses
- [x] 4x10x(2,10,20) matrix
- [x] Wyrmwood switchback course verified at counts 2, 10 and 20

## Notes
- Wyrmwood is now a seeded switchback course: 13..14 degree ramps with 26-unit
  turn drops, a 24-unit start channel, and a 5-unit gap between each ramp's low
  edge and the opposite wall so marbles roll off at every turn.
- Wyrmwood has no interior obstacles. Its ramp walls and centerline vary with
  the seed; the arena, start channel, start grid and finish line stay fixed.
- The start grid stacks alternating rows of five and four inside the 24-unit
  channel, with counts 2..20 validated.
- Recovery is unchanged. A 26-unit start drop, a 4.5-unit centerline lift and
  inset turn points give recovery valid clearance spots without moving marbles
  ahead of their progress.
- Verified matrix (10 seeds, counts 2/10/20, 120s window, recovery enabled):
  - 2 marbles: first 28.17s, last 29.45s, 0 DNF.
  - 10 marbles: first 26.12s, last 39.67s, 2 recoveries, 0 DNF.
  - 20 marbles: first 25.62s, last 40.32s, 8 recoveries, 0 DNF.
- Preview image: `reference/wyrmwood-preview.svg` (default seed 1).
- Phase 7B currently passes `npx tsc -b`, `npm run build`, `npm test`
  (143 tests) and `npm run lint`.
- Remaining work: validation for diamonds, rings and concave walls; spinner
  mount points on Ironhallow and Ashenmoor.
