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
| mute | `M`, or the SOUND button |

The sound is synthesised at runtime (`src/game/audio.ts`) rather than loaded, so there
are no audio files in the repository; the mute setting is remembered in `localStorage`.

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

1. Threshold — the chronoporter
2. Interval
3. Ballast — crates
4. Cascade
5. Lift — the anachroverter

Reaching a gate advances to the next level with `ENTER`. Every level is unlocked from the start:
the menu is the first thing the game shows, and `ESC` returns to it.

## The level editor

Press `E` on the menu and type `8147`. Draw a level with the mouse, `T` to play it, `X` to export
the `build…` function to paste into `src/game/level.ts`. Controls are in
[docs/AUTHORING.md](docs/AUTHORING.md).

## Buttons

A button is pressed while anything is resting in it — you, a former self, a crate, a monolith — and
released the moment nothing is; it is never solid. Its group's orange phase blocks are solid while
it is up and passable while it is held (or the reverse, for blocks declared `inverted`). Both states
apply to everything in the world, so a phased-out block holds nothing up and a block that goes solid
under a falling stone stops it. See [docs/AUTHORING.md](docs/AUTHORING.md).

## Devices

| device | behaviour |
| --- | --- |
| chronoporter | pauses the timeline while stood on; drag the slider anywhere inside the bounds, then step off to resume in the same direction from the new point |
| anachroverter | pauses the timeline and flips the direction of time with `R` |
| chronoclast | on contact, erases all recorded player history: ghosts, anomalies and every history-dependent consequence |

## Monoliths

A suspended monolith is let go at its tick and then nothing negotiates with it: pads, former selves
and your own body do not stop it, and nothing can shove it sideways. The single exception is a crate
directly underneath, which takes its weight and holds it up. A former self caught where it falls is
destroyed, which contradicts that run and spawns an anomaly.

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
