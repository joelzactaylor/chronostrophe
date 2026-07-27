# Fix: Box state gap after skipping forward in time

## Steps

- [x] 1. `src/core/world.ts` — Fix `boxStateAt()` to search backwards for the last known recorded state instead of falling back to `box.initial` for undefined entries.
- [x] 2. `src/core/world.ts` — Fix `stepBoxesForward()` to fill gaps in the box record before recording new ticks.
- [x] 3. Verify the fix compiles correctly — ✅ `tsc --noEmit` passes with zero errors.

