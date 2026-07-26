# Chronostrophe

A 2D platformer built around **one authoritative timeline**. The world state at any point in time is
whatever the timeline says it is — the player is a body inserted into that record, not a privileged
object simulated on top of it.

```
npm install
npm run dev        # http://localhost:5173
npm run check      # lint + typecheck + headless simulation checks
npm run build      # production bundle in dist/
```

## Controls

| action | keys |
| --- | --- |
| move | `A` / `D` or `←` / `→` |
| jump | `W` / `↑` / `Space` |
| duck | `S` / `↓` |
| reverse time (on an anachroverter) | `R` |
| scrub time (on a time device) | drag the slider under the viewport |

## The model

* **One scalar global time** per level, bounded at both ends (60 s at 60 Hz = 3600 ticks). Running
  into either bound while time is live ends the universe.
* **Everything is recorded.** Player runs and rigid-body worldlines are written into the timeline
  tick by tick. Scrubbing reconstructs the world from that record instead of re-simulating it.
* **Ghosts are physical, but transparent to you.** Previous recorded runs are present at their
  historically correct positions and act on the world as they originally did — they shove crates
  aside and crates ride on them — but the live body passes straight through them. The live body is
  marked with a glow and a pip.
* **Reverse time replays worldlines.** A rewinding box does not get a fresh backward force
  simulation — it retraces its recorded path frame by frame, while remaining a real collider. That
  is what makes the level's core trick work: push a crate off a shelf, dive after it, reverse time,
  and ride the crate back up its own fall.
* **Gravity is always down** for the live player, whichever way time runs, and the player is
  weightless for loading purposes but can still shove live boxes sideways.

## Devices

| device | behaviour |
| --- | --- |
| chronoporter | pauses the timeline while stood on; drag the slider anywhere inside the bounds, then step off to resume in the same direction from the new point |
| anachroverter | pauses the timeline and flips the direction of time with `R` |
| chronoclast | on contact, erases all recorded player history: ghosts, singularities and every history-dependent consequence |

## Paradox and singularities

A paradox is not "touching a ghost" — you can walk straight through your former selves. It is
invalidating the world conditions a recorded run needed: pinning a box into its recorded path where
the ghost cannot shove it away, or removing the box it stood on. When that happens the contradiction spawns a **singularity** that replays the
contradicted run from the interference point at double speed and then homes in on you. Capture warps
the screen through a fisheye collapse and restarts the level.

## Fail states

hazard contact · reaching the beginning of time · reaching the end of time · singularity capture.
Time-bound failure dissolves the level into dust; capture uses the fisheye collapse.

## Layout

```
src/core/types.ts     shared constants and state records
src/core/physics.ts   tilemap + AABB resolution
src/core/world.ts     the authoritative timeline: recording, scrubbing, replay, paradox detection
src/game/level.ts     level geometry and devices
src/game/GameScene.ts input, tick loop, rendering, fail states
src/game/HudScene.ts  time slider, direction indicator, banners
src/game/fisheye.ts   post-processing collapse shader
tools/simcheck.ts     headless checks for the timeline mechanics
```
