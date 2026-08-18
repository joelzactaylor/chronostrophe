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

### A row is rarely level with the row in front of it

Crates are 28px on a 32px grid, so two rows only ever line up exactly when they
stand on the same thing. A crate on a one-tile step is 4px above one standing on a
crate below that step, 8px for a two-tile step, and so on — and a chain that only
followed crates level to within 2px stopped at the last crate of the near row. The
shove then died where it stood: `shoveChain` walked that crate into one nothing had
asked to move, and the body came to a dead stop against a row it was flush with.

`World.sharesRow` is the rule the chain follows instead: the crate in front joins
if it is level with, or lower than, the one behind it, and the two still meet face
to face. Lower only — a crate higher than the one shoving it is standing on
whatever the near row is butted against, so a shove has nowhere to take it that
does not go through what holds it up — and not a whole crate lower, which is the
crate diagonally beneath, touching at a corner rather than standing in front.

Whether the row that joins can actually travel is not decided there. `shoveChain`
moves the far end first, so a front crate whose bottom is caught on the floor it
stands beside stops everything behind it exactly as any obstruction does.

`npm run sim -- step-push` shoves a row off a step into a row 4px lower, once into
open floor and once into a pillar the front row's bottom catches on.

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

### A former self is something to stand on

Ghosts are solid to objects — crates rest on them and are shoved by them — but they
are not in `otherBoxSolids`, so `boxIsFalling` used to answer "yes" for a crate
sitting squarely on a ghost's head. Every pass that leaves falling crates alone then
skipped it, including the one that carries a rider along with the body underneath it,
and the crate hung in the air at head height while the former self walked out from
under it. `boxIsFalling` takes the ghost solids into account for exactly that reason.

A whole stack rides, not just the crate in contact: `boxRidesGhostChain` follows the
supports upward, so anything standing on the crate on the head is carried too. A
support that is itself falling is not part of that chain — a crate resting on one is
coming down with it, not riding the body underneath.

Riders are moved in the order that keeps a stack from treading on itself: rising, the
crate on top goes first and makes room for the one under it; sinking, the bottom one
goes first. Taken in a fixed order the crate on the head is blocked by its own
stack-mate the instant the body jumps, is left behind by the rise, and the stack
slides off — which is exactly what a single crate never does, so it only shows up
once something is stacked on top.

`npm run sim -- head-carry [x] [stack]` drops a stack onto a recorded body and reports
how many of the ticks on that head each crate is carried for, and how far the stack
leans. `npm run sim -- head-jump [stack]` does the same while the body is jumping.

### A spring firing is a recorded fact, not a pose

A spring throws whatever lands on it, and the squash and the sound are how the player
knows it happened. Neither can be worked out from where a body is: one thrown on this
tick and one falling past on the next stand in the same place a pixel apart. So the
throw is written down. Every body carries the spring that threw it — `sprung` on
`PlayerState` and on `BoxState`, an index into the level's springs — and
`World.firedSprings` is read back off the bodies each tick rather than accumulated as
the tick runs.

That is one rule for three cases. The live body sets it in `stepPlayer`. A crate sets
it in `stepBoxesOwnMotion`, where the spring underfoot has to be found with a foot
probe: a spring is solid to a crate, so a crate that landed on one is flush with the
plate and overlaps nothing, and the overlap test that finds the spring for the body
finds nothing at all for a crate. A former self sets it by being replayed — its
recorded state carries the throw, so the spring fires again on the tick it fired,
replayed or rewound.

While the timeline is frozen on a device only the live body is read: `now` does not
advance there, so a recorded bounce sitting on that tick would fire every frame the
player stood on the pad. `npm run sim -- spring-fire` covers all four cases.

### Buttons are pressable while time runs backwards

Reverse playback restores the solidity each tick was recorded with, so that the
becoming-solid delay is retraced exactly and a ghost that crossed a block during it is
not judged to have walked through a wall. That record is only binding for as long as
the world still agrees with it, and **the live body is the only thing it cannot
account for**: everything else standing on a button during a rewind is the very crate
or former self the recording was made with. So `bodyPressedHistory` holds the body's
own contribution to the pressed set at each tick, and `restorePhaseState` leaves a
group to the live world only where the body's standing in its button differs from what
the body was doing then. Everything untouched still retraces itself.

Comparing the *whole* pressed set instead does not work, and fails in a way worth
knowing about: buttons are read before the world moves, which going backwards is the
tick being left, so a ghost crossing the edge of a button reads a tick out of phase
with the recording. Every such edge threw the recorded solidity away — and a former
self walking a run of phase blocks it had opened for itself was dropped through a floor
it had not opened yet. For the same reason the restore takes the tick being *entered*:
that is the tick the world is judged at once the step is over.

The live body is unaccounted for in one more way: where it *stands*. Forward, a
block that wants to become solid waits while anything is inside it; backward, the
solidity comes from the recording, which cannot know the body has since walked into
the slot. `restorePhaseState` therefore holds the same exception the forward delay
does — the passable → solid edge of the retrace defers while the live body overlaps
the block, and keeps trying, so the block goes solid the moment the body is out of
it. Without this a rewind crossing the tick a crate was shoved onto a button
restored the block to solid around the body standing in it, and the body was
crushed by a wall that history put back. `npm run sim -- reverse-crush` holds all
three sides: the occupied slot stays open, an empty one still retraces, and the
block closes behind the body the moment it leaves.

Being *inside* a solid phase block is judged at `CRUSH_DEPTH`, exactly as the
monolith is. A run's last stride off the edge of a block can lap its corner by a
fraction of a pixel — whether it does is the stride's phase against the edge — and
that pose sits in the record untried until an anachroverter reversal replays it as a
ghost. A graze the live body walked away from must not condemn the ghost retracing
it. `npm run sim -- phase-ledge` sweeps the alignments, and holds the paradox the
depth must keep catching: the live body standing in a button mid-rewind, closing a
wall across a fall its former self has yet to retrace.

### A crate resting on nothing

Pulling a block out from under a crate while time runs backwards leaves the crate
retracing a worldline the world can no longer produce: forward time would have dropped
it, but a rewinding crate obeys its record rather than gravity. `boxIsFloating` catches
it, and the crate comes apart — `World.breakCrate` takes it out of the world entirely
(nothing rests on it, nothing is stopped by it, no button feels it, it does not move)
and the contradiction runs back down its own record at `UNWRITE_SPEED`, erasing it.
Reaching the start of the epoch ends the level. The chronoclast makes torn crates whole
again: there is no longer a recorded past for them to be in contradiction with.

The floating test is shared with the one for former selves, and both are deliberately
slack: `FLOATING_TICKS` of stillness, and `restsOnSomething`, which asks only whether
*anything* is within `FLOATING_SLACK` of a body's feet — tiles, crates, phase blocks,
springs, device pads, and, for a crate, the recorded bodies it can rest on (former
selves are transparent to each other, so a ghost is never held up by one). A surface
counts as a floor only if its top edge sits at foot level (no deeper into the body
than `CRUSH_DEPTH`, no further below than the slack), which is what keeps the wall
beside a body from reading as the floor beneath it.

One solid, named by the record, is granted slack *sideways* as well: the crate the
ghost's record says it stood on. Footing is legal to within a pixel of a crate's lip
(`standsOn`), so that crate can settle or be nudged past the footprint entirely and
still be the crate it stood on, an arm's reach away rather than gone. Nothing else
earns the lateral grace, and the reason is the wall's reason over again: crate tops
recur at every height up a stack the way tile tops do up a wall, so a stack an arm's
reach away would vouch for a body its crates never held up — and a monolith cannot
be nudged sideways at all, so one beside the footprint was never underfoot. The
lateral window is also only a graze tall, because a slid support keeps its row's
height. `npm run sim -- floating-swallow` holds the line from both sides: the slid
support forgiven, the bystanders refused. `supportUnder`, which decides what a body
is *standing* on, probes a single pixel and has to be exact; a record is a pose at
the end of a tick and the world it is replayed into settles a fraction differently,
so reading "resting on nothing" that exactly calls a paradox on bodies that are
doing nothing wrong. The cost of a false one is a run that did nothing wrong.

`npm run sim -- rewind-paradox` is the check that matters here: it lives a run on every
built-in level, stands the body still, and reverses through the whole recording, where
nothing can legitimately be contradicted. It has to report zero. `ghost-floating` covers
the other end — the paradoxes that must still be caught — and `reverse-button` the
crate that genuinely is left standing on nothing.

### Standing on something

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