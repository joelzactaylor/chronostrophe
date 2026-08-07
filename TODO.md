# Chronoclast Epoch-Boundary Implementation

## Steps
- [x] 1. Inspect BoxState, reverse crate playback, erasePlayerHistory, boxStateAt, scrubTo, detectParadox, and the chronoclast caller.
- [x] 2. Confirm the smallest complete implementation.
- [x] 3. In `src/core/world.ts`, replace `erasePlayerHistory()` with `chronoclast()`:
  - [x] Capture movable crate states (not monoliths).
  - [x] Recover effective reverse-playback velocity when `dir === -1` (negate stored forward velocity), write back to `box.state`.
  - [x] Force `dir = 1` (new epoch runs forward).
  - [x] Clear each movable crate's `record[]`, reset `recordedMax` to `now`, and write the captured state as the first record.
  - [x] Erase player runs, open fresh run, record player at boundary.
  - [x] Refresh buttons/phase solids and reseed phase solidity history.
  - [x] Leave monoliths (`immovable === true`) completely untouched.
- [x] 4. In `src/game/GameScene.ts`, update the call site to `world.chronoclast()`.

## Epoch boundary (prevents access to pre-chronoclast time)
- [x] 5. Add `epochStart` field to `World`.
- [x] 6. `chronoclast()` sets `epochStart = now`.
- [x] 7. `boxStateAt()` clamps the lookup lower bound to `epochStart` (no crate can revert to `box.initial` or read pre-boundary records).
- [x] 8. `scrubTo()` clamps the target to `epochStart` (can't scrub back before the boundary).
- [x] 9. `step()` clamps the reverse target to `epochStart` (rewinding stops at the boundary).
- [x] 10. `atTimeBound()` treats reaching `epochStart` as the beginning-of-time boundary.

## Epoch boundary visual indication
- [x] 13. In `HudScene.ts`, draw the erased pre-epoch region of the timeline track as a dimmed, hatched stretch and put a pulsing boundary marker at `epochStart`, styled like the track's own beginning/end ticks.

## Verification
- [x] 11. `npm run typecheck` passes.
- [x] 12. `npm run lint` passes.
</content>
