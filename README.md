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
| abandon the run (when a level has walled itself off) | `K`, or the ABANDON RUN button |
| level select | `ESC`, or the LEVELS button |
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
  is what makes the core trick work: stand on a fallen stone, reverse time, and ride it back up its
  own fall.
* **Gravity is always down** for the live player, whichever way time runs, and the player is
  weightless for loading purposes but can still shove live boxes sideways.

Writing your own levels: [docs/AUTHORING.md](docs/AUTHORING.md).

## Levels

| # | level | the idea |
| --- | --- | --- |
| 1 | Threshold | A flat sprint for the gate. 2.5 s in, a suspended monolith is let go and walls off the run. The chronoporter sits on the near side: scrub the world back to before the stone fell, then walk under the space it is going to occupy. |
| 2 | Interval | Two stones on the same run, let go at different moments. Sprint past the near one inside its window to reach the pad in the middle, then scrub back to walk through the far corridor, which is already sealed in the present. |
| 3 | Ballast | The gate is on a shelf out of jumping reach and the crate is the step that closes the gap — but the crate starts on the near side of a stone that comes down four seconds in, and shoving a crate is slow. Scrub back at the pad beside it and there is time to push it through. |
| 4 | Cascade | Three stones down a long run, each one let go too early to be beaten from where the last one left you. Every pocket between them has its own pad: reach it, put the world back to the start, walk on. The gate is up on a shelf at the end, so the last pocket has to be left with the crate. |
| 5 | Lift | The introduction to the anachroverter. The gate is high up beside the place a stone hangs, and there is no way up until the stone comes down. Reverse time on the pad, climb the crate onto the resting stone, and ride it back up its own fall to the gate. |

Reaching a gate advances to the next level with `ENTER`. Every level is unlocked from the start:
the menu is the first thing the game shows, and `ESC` returns to it.

## Devices

| device | behaviour |
| --- | --- |
| chronoporter | pauses the timeline while stood on; drag the slider anywhere inside the bounds, then step off to resume in the same direction from the new point |
| anachroverter | pauses the timeline and flips the direction of time with `R` |
| chronoclast | on contact, erases all recorded player history: ghosts, anomalies and every history-dependent consequence |

## Paradox and anomalies

A paradox is not "touching a ghost" — you can walk straight through your former selves. It is
invalidating the world conditions a recorded run needed:

* a former self is left **standing on nothing** — the crate that held it up is somewhere else now;
* a crate sits **where a former self's body was**, and the ghost cannot shove it clear.

The moment that happens the run stops being history and becomes an **anomaly**. It keeps its ghost
body — translucent, pulsing red, with no interaction with the level at all — and instead of chasing
you across the room it chases you through time: it retraces *your* worldline from where its history
broke, two lived steps for every one you live, and is drawn wherever on that path it has got to
regardless of the tick the world is currently showing. Being out of its own time is the point of it.
The HUD counts how much of your own path is left in front of it; when it runs out the anomaly has
reached your present, and the run collapses through a fisheye warp. Standing still does not help —
you keep living steps on a pad — but a chronoclast erases the path it is walking.

## Fail states

hazard contact · being crushed · reaching the beginning of time · reaching the end of time · an
anomaly reaching your present. Time-bound failure dissolves the level into dust; the anomaly uses the
fisheye collapse.

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
