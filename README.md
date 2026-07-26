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

## Levels

| # | level | the idea |
| --- | --- | --- |
| 1 | Threshold | A flat sprint for the gate. 2.5 s in, a suspended monolith is let go and walls off the run. The chronoporter sits on the near side: scrub the world back to before the stone fell, then walk under the space it is going to occupy. |
| 2 | Interval | Two stones on the same run, let go at different moments. Sprint past the near one inside its window to reach the pad in the middle, then scrub back to walk through the far corridor, which is already sealed in the present. |
| 3 | Sealed | The stone comes down on the gate itself. In the present the way out is buried; from the pad the gate is a second's walk away in the past. |
| 4 | Cascade | Three stones down a long run, each one let go too early to be beaten from where the last one left you. Every pocket between them has its own pad: reach it, put the world back to the start, walk on. |
| 5 | Fallback | Push the crate off the upper shelf, dive after it, stand on the anachroverter and reverse time, then ride the crate back up its own fall to the exit shelf. |

Reaching a gate advances to the next level with `ENTER`.

## Devices

| device | behaviour |
| --- | --- |
| chronoporter | pauses the timeline while stood on; drag the slider anywhere inside the bounds, then step off to resume in the same direction from the new point |
| anachroverter | pauses the timeline and flips the direction of time with `R` |
| chronoclast | on contact, erases all recorded player history: ghosts, singularities and every history-dependent consequence |

## Paradox and singularities

A paradox is not "touching a ghost" — you can walk straight through your former selves. It is
invalidating the world conditions a recorded run needed:

* a former self is left **standing on nothing** — the crate that held it up is somewhere else now;
* a crate sits **where a former self's body was**, and the ghost cannot shove it clear.

The moment that happens the ghost stops being history: it is replaced by a **fuse ghost** that burns
red where the contradiction occurred, then ignites into a **singularity** which replays the
contradicted run from that point at double speed and finally homes in on you. Capture warps the screen
through a fisheye collapse and restarts the level.

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
