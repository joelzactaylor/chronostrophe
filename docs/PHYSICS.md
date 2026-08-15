# Game Physics Overview

This document summarises the two-layer physics system used by Chronostrophe and points to the core files to edit and tune.

## Overview
- Core files: `src/core/physics.ts`, `src/core/world.ts`.
- **Everything that moves is the deterministic code**, and only that. `World` builds a
  `CrateWorld` in its constructor and never steps it — nothing calls `step()`, `resolve()`
  or `setBox()` — so crates, the body and recorded bodies are all resolved by the
  axis-aligned rectangle math in `src/core/physics.ts`. Debug motion there, not in
  `cratePhysics.ts`. It is also what lets the whole simulation run headless under node:
  stub the one `phaser` import and `npm run sim` drives the real game logic.

## Tile / Deterministic Physics
- File: `src/core/physics.ts`
- Model: Axis-aligned rectangle math (no external engine). Implements `moveX`, `moveY`, `depenetrate`, `supportUnder` and TileMap collision checks.
- Purpose: Deterministic, per-tick stepping for the live player and recorded bodies so timeline/rewind behavior is exact and reproducible.

### The standing invariant: nothing crosses a solid in one tick

Every primitive here is bounded, and none of them may relocate a body past something
it was inside. Breaking any one of these produced the same visible bug — a crate
appearing on the far side of whatever was pushing it.

- **`moveX` / `moveY` undo only the penetration their own motion caused.** A surface
  further into the body than the body has just travelled (plus `CONTACT_SLOP`) was
  already there before the move; it belongs to `depenetrate`. Without this, a crate
  brushing a former self's head reads as ground and hops on top of it, and a crate
  dropping past the body's shoulder reads as a wall and throws the body backwards.
- **`depenetrate` takes only the *near* face on each axis.** The far face is not a way
  out but a way through. It resolves the deepest overlap first, iterates, and keeps
  the least-buried position reached.
- **`depenetrate`'s `escape` mode says who may wait.** An object takes the shortest
  way out even when it is blocked, and waits for the tick or two until whatever is
  against it moves — a crate that climbed its own height whenever a neighbour was a
  hair too close would be worse than one that stays put. The live body cannot wait:
  see the crushing note below. Level geometry is the exception to both, since a wall
  never moves on, so nothing is ever left inside one.
- **A shove is bounded by the shove.** `World.applyGhostMotion` and `World.pushBox`
  move a crate at most as far as the shoving body itself travelled plus one push
  step, and a body only shoves what is in front of it (`World.aheadOf`). A chain held
  up for a few ticks catches up gradually instead of snapping clear.
- **Grazing something is not being inside it.** The "must escape level geometry" rule
  applies only past `SUPPORT_INSET` of penetration. A crate settling onto a ledge laps
  the floor by a hundredth of a pixel constantly, and treating that as a wall to
  escape at any cost sent it a whole tile sideways whenever the pixel above it was
  blocked.

### A crate on its way down is no part of the row it is leaving

Three rules follow from this, and all three have to hold together or a chain jams
against its own falling end:

- It does not join a shove (`pushChain` excludes it) — so the load shrinks and the
  body speeds up as crates drop, instead of paying drag for crates that have gone.
- It does not stop one (`shoveChain`'s `ignoreIds`). The live push and the replayed
  push both apply this; when only the replayed one did, the body came to a dead stop
  for a quarter of a second every time the far stack went over the edge.
- It does not hold up what is riding behind it (the carry pass's solids). Letting it
  cost the carried row a whole push step per stack, shearing the rows apart.

### Worldlines are written at the end of the tick

`World.recordBoxes` runs last, after the live body has shoved and after both carry
passes. Written from inside `stepBoxesForward` instead — before either — a crate
being pushed was recorded a full push step (2.17px) behind where it was actually
drawn, every tick of the push.

That matters because reversing time does not re-simulate: it grafts `box.record`
back onto the object frame by frame. A record that lagged what was on screen meant
the rewind played back a path that was never the one lived, which is the one thing
the core trick depends on.

For the same reason, a rewinding object is not carried. Its worldline already
contains the shove, the ride and the fall, so `step` marks every object as already
handled while `dir === -1`; adding a support's movement on top counts the same
motion twice and walks the object off its own recorded path.

`npm run sim -- record-fidelity` checks the record against what was drawn, and
`npm run sim -- rewind-fidelity` runs a stretch forwards and then backwards and
compares tick for tick. Both should read 0.000px.

### Both bodies act at the same point in the tick, off the same information

A run has to replay as it was lived. Two things used to stop that, and they had to
be fixed together — either alone makes the other worse.

**The tick has one shape.** Objects take their own tick first (gravity, and whatever
that runs them into); then the recorded bodies act; then the live body acts. Each of
those is followed by its own carry pass, taking its own before-snapshot, so no pass
can mistake another's movement for a support's and hand it on twice. The object pass
resolves against recorded bodies at their *start-of-tick* positions — they have not
moved yet, and resolving against where they are about to be lands a crate riding one
on its new position, which the next pass then carries it to a second time.

With the two bodies either side of the object pass, a crate shoved past the lip of a
ledge was already over nothing when gravity reached it, so it began falling a tick
earlier replayed than lived. Half a pixel, and it lands 126px away.

**A body's intent is recorded, not just its position.** `PlayerState.intentX` is how
far the body tried to travel sideways this tick. The live push fires from `moveX`
reporting a hit — the body *tried* to walk into the crate and was stopped flush
against it — and the position that gets recorded is that resolved one. A former self
retracing those positions never overlaps the crate it spent the whole run shoving,
so it cannot tell the tick contact was made from the tick before, whatever order the
passes run in. `applyGhostMotion` therefore tests against where the body *reached
for* (`pr.x + intentX`), and shoves exactly one push step, as `pushBox` does. The two
have to agree to the pixel: a recorded body that shoves harder than the run did
leaves the crate overlapping the one ahead, the next tick's depenetration undoes it,
and the pile ends up where the run never put it.

Measured with `npm run sim -- fidelity`: replay drift over a row of stacks shoved off
a ledge went from 123–126px to 0.00–1.88px, and the worst per-tick crate delta
improved at the same time, from 3.77px to 3.39px.

One consequence to keep in mind: a crate pushed past the lip now waits a tick before
gravity reaches it, in the replay exactly as in the live run. That is the correct
behaviour, and it is why a crate at the end of a chain can hang for a few ticks
rather than one. Restoring a carry pass after the object motion removes the hang and
costs all of the fidelity above — it was tried; do not.

### Standing on something### Standing on something

`moveY` and `supportUnder` share one footing test, `standsOn`: more than
`SUPPORT_INSET` of the footprint has to be over a surface. They must agree. When they
did not, a crate grounded by `moveY` on a third of a pixel of ledge was called
unsupported by `supportUnder` — so it counted as falling, was excluded from every
shove as a crate on its way down, yet never actually fell, and the row behind it
stopped dead against a crate nothing was allowed to push.

The carry pass orders crates by row and then along the direction of travel, reading
row membership coarsely (`ROW_TOLERANCE`). Crates side by side drift fractions of a
pixel apart vertically, and sorting on that exactly swaps them, so the crate behind
is carried into one that has not moved yet and the whole row falls a push step
behind the row beneath it.

### Crushing

Two rules decide it, and they must agree with each other:

- `World.stepPlayer` sets `crushed` when resolving took more than the body's own
  width, **or** when `depenetrate` could not free the body at all and left it buried
  deeper than `CRUSH_DEPTH`.
- `GameScene` independently kills the body on any tick it is more than 3px inside a
  crate. This is why the live body's `escape` is `'any'`: a body left resting inside
  a crate dies, so it must always take whatever way out it can find. Objects have no
  such rule, which is why they may wait.

`World.detectParadox` uses `CRUSH_DEPTH` for the same reason — a graze the live body
walked away from must not condemn the ghost that replays it.

## Crate Physics (Matter-backed) — built, but not in the simulation path
- File: `src/core/cratePhysics.ts`
- Status: constructed by `World` and never stepped. Nothing below affects gameplay today.
- Model: Phaser Matter (Matter.js) for dynamic rigid bodies (crates, ghosts, springs, devices, phase solids).
- Exposed API (used by `World`):
  - `setPlayerPose`, `movePlayer`, `readPlayer`
  - `setBox`, `removeBox`, `setBoxState`, `readBox`
  - `applyGravity`, `shoveBox`, `translateBox`, `setBoxStatic`
  - `setPhaseSolid`, `setGhosts`
  - `resolve()`, `step()`, `bounceBox()`
  - `playerGroundedOn` (getter), `playerSpringRectContact` (getter)
- Notes: Uses collision categories/masks so device pads are solid to crates but passable to the live player.

## Player Movement & Controls
- File: `src/core/world.ts` (player logic) + `src/core/physics.ts` (movement primitives)
- Key constants (in `world.ts`): `GRAVITY`, `MOVE_SPEED`, `AIR_ACCEL`, `GROUND_ACCEL`, `FRICTION`, `JUMP_VEL`, `JUMP_CUT`, `COYOTE_TICKS`, `BUFFER_TICKS`.
- Mechanics: per-tick acceleration (ground vs air), coyote time, jump-buffering, jump-cut for short hops, friction on the ground. `moveX`/`moveY` perform deterministic collision stepping.

## Boxes / Crates
- Representation: `Box` in `world.ts` with per-tick recorded states for timeline playback.
- Shoving/stacking: `BOX_PUSH_SPEED`, `BOX_LOAD_DRAG` govern shove mechanics. Monoliths/immovable boxes are static.

## Special Features
- Springs: low plates (height `SPRING_H`) that impart `SPRING_VEL`. Handled by both deterministic checks and Matter collisions.
- Device pads / chrono-devices: solid for crates, passable to live player — implemented via collision masks and World button logic.
- Phase blocks: solidity toggles based on buttons; World tracks pressed groups and applies a becoming-solid delay. `setPhaseSolid` mirrors solids to Matter.
- Ghosts / Replays: historical bodies are represented for overlap checks (buttons/phase) and can be mirrored in Matter via `setGhosts` as simple static masks.

## Integration & Timing
- Physics config: `main.ts` enables Matter with `autoUpdate: false` so stepping is driven by the game tick.
- Ticking: World runs at fixed 60Hz; CrateWorld uses `tickMs = 1000/60` and `step()`/`resolve()` to update the Matter engine synchronously with the game tick.
- Syncing: `World` writes recorded states into `CrateWorld` (scrub/restore) and reads live positions via `readBox`/`readPlayer` to display and record.

## Tunables & Where To Change Them
- Movement constants: `src/core/world.ts`.
- Tile size, DT/TICKS, ground flags: `src/core/types.ts`.
- Crate physical properties (friction, restitution, slop, masks): `src/core/cratePhysics.ts`.

## Testing & Iteration
- Dev run for playtesting:

```bash
npm run dev
```

- Typecheck and build:

```bash
npm run typecheck
npm run build
```

- Focus test cases: pushing stacks, spring launches, device-pad button behavior, phase-block timing and ghost/contradiction scenarios (replays).

---

If you want, I can add a short checklist of play-test scenarios or extract the key tunables into a single config file for easier iteration.