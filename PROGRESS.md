# Progress: Phase 7A - Static Track Replacement

## Checklist

- [x] Old tracks removed
- [x] Four track definitions with centerlines and `DEFAULT_SEEDs`
- [ ] New geometry types (diamonds, ring pegs, angled bars, concave walls)
- [x] Per-track start grids with count-10 pins (Generic implementation exists, verify if specific overrides needed)
- [ ] Validation for the new shapes
- [ ] Selector UI with four cards and previews
- [ ] Spinner mount points on Ironhallow and Ashenmoor
- [x] Tests
- [x] 4x10x(2,10,20) matrix

## Notes
- `src/track/generate.ts` and `src/data.ts` have been updated with the four tracks.
- The 4x10x(2,10,20) matrix tests are passing for the new tracks.
- Need to implement the new geometry types, validation, UI, and spinner mount points.
