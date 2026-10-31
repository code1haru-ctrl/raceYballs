# Progress: Phase 7A - Static Track Replacement

## Checklist

- [x] Old tracks removed
- [x] Four track definitions with centerlines and `DEFAULT_SEEDs`
- [x] New geometry types defined (diamonds, ring pegs, angled bars, concave walls)
- [x] Per-track start grids with count-10 pins
- [ ] Validation for the new shapes (diamonds, rings, concave walls)
- [x] Selector UI with four cards and previews
- [ ] Spinner mount points on Ironhallow and Ashenmoor
- [x] Tests for track generation, start grid and diamond extents
- [x] 4x10x(2,10,20) matrix

## Notes
- The Wyrmwood start-grid fix is complete: staggered 3/2 rows, a 24-unit start channel, the first obstacle section moved down, and counts 2..20 validated.
- Diamonds now store finite `halfW`/`halfH` extents. The previous `radius` field was not part of `TrackDiamond`, so the extents were undefined.
- Phase 7A currently passes `npx tsc -b`, `npm run build`, `npm test` (142 tests) and `npm run lint`.
- Remaining Phase 7A work: validation for diamonds, rings and concave walls; spinner mount points on Ironhallow and Ashenmoor.
