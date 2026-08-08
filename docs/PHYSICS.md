# Game Physics Overview

This document summarises the two-layer physics system used by Chronostrophe and points to the core files to edit and tune.

## Overview
- Goal: Two-layer physics — deterministic tile-based gameplay + Matter.js rigid-body crates.
- Core files: `src/core/physics.ts`, `src/core/cratePhysics.ts`, `src/core/world.ts`.

## Tile / Deterministic Physics
- File: `src/core/physics.ts`
- Model: Axis-aligned rectangle math (no external engine). Implements `moveX`, `moveY`, `depenetrate`, `supportUnder` and TileMap collision checks.
- Purpose: Deterministic, per-tick stepping for the live player and recorded bodies so timeline/rewind behavior is exact and reproducible.

## Crate Physics (Matter-backed)
- File: `src/core/cratePhysics.ts`
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
- Representation: `Box` in `world.ts` with per-tick recorded states for timeline playback. Movable crates are backed by Matter bodies for realistic interactions.
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