# Building your own levels

Every level is one function in [`src/game/level.ts`](../src/game/level.ts) that returns a
`LevelDef`, plus one entry in the `LEVELS` array. There is no editor and no level format on disk:
the map is a grid of characters built with helpers, and everything else is coordinates in pixels.

## A minimal level

```ts
function buildMyLevel(): LevelDef {
  const grid = blankGrid();               // 44 x 17 tiles of '.'
  fill(grid, 0, 15, COLS - 1, ROWS - 1);  // floor: rows 15-16, full width
  fill(grid, 0, 0, 0, 14);                // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14);  // right wall

  return {
    name: 'My Level',
    map: new TileMap(grid.map((r) => r.join(''))),
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },   // feet on row 15
    boxes: [],
    devices: [pad('chronoporter', 20, 15, PORTER_LABEL)],
    hazards: [],
    exit: { x: 40 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}
```

Then add it to the list — the menu, the level counter and `ENTER`-to-advance all read from it:

```ts
export const LEVELS: (() => LevelDef)[] = [buildThreshold, /* … */ buildMyLevel];
```

`corridorGrid()` already returns the floor-plus-two-walls shape used by levels 1-4, so most levels
start from that and add shelves with `fill`.

## The numbers you need

| thing | value | consequence |
| --- | --- | --- |
| `TILE` | 32 px | tile *column* `cx` is at `cx * TILE` |
| player | 20 x 28 px (16 tall ducking) | a 1-tile gap is walkable, a 1-tile-high slot is duckable |
| `MOVE_SPEED` | 215 px/s | ≈ 3.6 px/tick, ≈ 6.7 tiles/s |
| `JUMP_VEL` / `GRAVITY` | -580 / 1900 px/s² | apex ≈ 88 px (2.75 tiles) up, ≈ 4 tiles across |
| `BOX_PUSH_SPEED` | 130 px/s | shoving a crate is ~40% slower than walking |
| `TICKS` | 3600 (60 s at 60 Hz) | running off either end of the timeline ends the universe |

Two consequences worth memorising, because most of the existing puzzles are built on them:

* A **3-tile-high shelf (96 px) cannot be jumped onto** from the floor, but **can** be reached from
  the top of a 28 px crate. That is the whole of "Ballast": the crate is the only step.
* A stone released at tick `R` is only passable from a spot within `R / 60 * 215` px of it. That
  arithmetic is what sets the sprint windows in "Interval" and "Cascade".

## The furniture

```ts
{ x, y, w, h }                                  // a crate: pushable, falls, rides other boxes
{ x, y, w, h, immovable: true, releaseTick: R } // a monolith: held in the air until tick R
monolith(cx, R)                                 // the standard 4x3 stone, hung at row 2
pad('chronoporter'  , cx, surfaceRow, label)    // stand on it to scrub the timeline
pad('anachroverter' , cx, surfaceRow, label)    // stand on it and press R to flip time's direction
pad('chronoclast'   , cx, surfaceRow, label)    // erases your recorded history
hazards: [{ x, y, w, h }]                       // spikes: touching them kills
exit:    { x, y, r }                            // the gate, as a centre and a radius
```

A monolith is unstoppable except by a crate directly beneath it: it ignores pads, ghosts and the
live body, is never shoved sideways by anything, and a former self caught under it is destroyed —
which contradicts that run and spawns an anomaly. A crate under it takes its weight, so a monolith
can be parked at crate height on purpose.

A pad's `surfaceRow` is the row it sits *on top of*, so `pad('chronoporter', 20, 15, …)` is on the
floor at row 15. A pad is a volume the player fits inside — one tile wide, `PLAYER_H + 6` tall — and
it is **solid to objects but open to the live body**, so crates stop against it and never
settle in the space you have to stand in. A pad in a crate's path is therefore a wall for the crate:
put pads where the crate does not have to travel.

## Designing with the timeline

The mechanics only produce puzzles because of one asymmetry: **scrubbing moves the world, not you.**
Standing on a chronoporter and dragging the slider back to tick 5 puts every stone and crate back
where it was at tick 5 while you stay where you are — with a fresh clock to spend.

* **Chronoporter puzzle** = a place that is only reachable in the past, plus a pad you can reach in
  the present. The stone that seals a corridor at tick 150 is a door that is open early and shut
  late; the pad is how you get back to "early" while standing somewhere new.
* **Anachroverter puzzle** = a moving worldline you want to ride. Reversed time replays recorded
  motion backwards, so a stone that fell becomes a lift. Let it go early and reach the pad late:
  rewinding then leaves a stretch of the stone sitting still to climb onto before it starts rising.
* **Your ghosts are solid for objects but not for you.** A previous run will shove the same crates
  it shoved the first time, which is a resource. Leaving a ghost standing on a crate you then move
  away is a paradox: the contradicted run becomes an anomaly that retraces your own worldline at
  double speed, and reaching your present ends the run.
* Only what you have actually lived is recorded, so you can never scrub past `now` into the future.

An overlap that no motion caused — a crate shoved into a standing body by a ghost — is undone by the
shortest of the four rect exits before anything moves that tick, so bodies and crates slide apart
sideways instead of being lifted onto each other. A fix-up larger than the player's own width is
still a crush, and still kills.

## Verifying it

`tools/simcheck.ts` drives `World` headlessly, with no Phaser and no rendering, and `npm run check`
runs it alongside lint and typecheck. Add a case per level: play the intended route with scripted
input and assert it reaches the gate, then play the dumb route (`sprintOnly` — hold right and jump)
and assert it does *not*. The existing helpers to copy are `playPorterLevel` (walk right, scrub on
every pad) and `playCrateLevel` (the same, then shove a crate and climb it).

This is the fastest loop for tuning release ticks: change a number, run `npm run check:sim`, and the
failure message reports the tick each pad was reached at.

Then play it: `npm run dev`, pick the level from the menu, `K` to abandon a run that has walled
itself off, `ESC` to get back to the menu.
