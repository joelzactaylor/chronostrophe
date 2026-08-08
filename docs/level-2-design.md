# Level 2 design — "Scaffold"

Draft for review. Level 1 ("Threshold") teaches *the world at time T is whatever the timeline says*.
Level 2 should teach the next fact, which is the strangest thing the engine already does:

> **Your former selves are physically real to objects.** A crate shoved against a ghost stops. A crate
> pushed onto a ghost's head rests there and stays there for as long as that recorded run exists.

So level 2 is a climb, and the building material is your own history.

## The one-sentence pitch

A shaft with no ladder: you climb out on crates that are being held up by earlier versions of
yourself, and the shape of your climb is decided by *when* each of those versions happens to be
standing there.

## Devices

| device | why it's here |
| --- | --- |
| chronoporter | the working tool: park the world at a chosen tick so a chosen ghost exists |
| chronoclast | at the bottom of the shaft, as the "I've tangled my history, wipe it" button |

No anachroverter — reverse time is level 3's ("Fallback") lesson, and withholding it keeps this level
about *where in time you put your bodies*, not about running the film backwards.

## Geometry sketch (44 x 17 tiles, as the others)

```
row 2                                     ####  <- exit ledge + gate (col 34..38)
row 5                        ####               <- landing B (col 26..29)
row 8            ####                           <- landing A (col 14..17)
row 11   ##########                             <- entry shelf, crate 1 sits here (col 4..13)
row 15   ########################               <- floor, chronoporter (col 8), chronoclast (col 3)
                       ^^^^ pit with spikes (col 18..23), floor removed
```

* Jump height is ~88 px = under three tiles, so every 3-tile step is *just* out of reach: a crate
  (28 px) plus a ghost's shoulders (28 px) is exactly the boost that closes it.
* Two crates only. Crate 1 starts on the entry shelf, crate 2 in the pit (so the pit has to be
  crossed on a crate, or on a ghost, not jumped).

## Intended solution, beat by beat

1. **Record a stander.** Walk to the base of landing A and simply stand there for ~3 s. That's the
   only thing this run does — it is a recording, not progress. Step onto the chronoporter, scrub back
   to the start of that stand, step off. Your run splits; the stander is now a ghost.
2. **Build the first step.** With the ghost standing there, push crate 1 off the entry shelf so it
   lands *on the ghost*. The crate rides the recorded shoulders: a 56 px platform where there was
   none. Jump crate → landing A.
3. **Cross the pit with a ghost, not a jump.** From landing A, walk back out over the pit and stand
   mid-air? You can't — so instead push crate 2 out of the pit by shoving it against a ghost that is
   standing in the pit: the crate cannot pass through history, so it climbs the pit wall as the two
   bodies close. (Needs a playtest: this is the one beat that depends on push-vs-ghost geometry.)
4. **Landing B.** Same trick as beat 2 one storey up, but now the ghost you need is the one from
   beat 2's climb — which only exists in a narrow window of ticks. Scrubbing to the wrong second
   leaves you with a crate and nothing to rest it on.
5. **Don't break your own scaffolding.** The exit ledge is reached from crate-on-ghost at landing B.
   The moment you shove that crate away (or scrub past the end of the ghost's window) the crate is
   left resting on nothing, that run is contradicted, and it burns into a fuse ghost that comes
   after you. The intended route never needs to break it; a sloppy route does.

## What the level is actually testing

* Ghosts are solids for objects (level 1 never shows this).
* A recorded run has a *window*: it exists at some ticks and not others, so "where can I stand" is a
  question about time, not space.
* The paradox rules become a real threat for the first time, from the player's own construction.

## Open questions for you

1. **Slot order.** Put this in as level 2 and push "Fallback" to level 3, or keep Fallback at 2 and
   make this level 3? (Scaffold is the better second lesson; Fallback is the better finale.)
2. **Beat 3.** Shoving a crate up a wall against a ghost is the least certain mechanic here. The
   fallback is a held slab (level 1's monolith machinery) that drops into the pit at a fixed tick and
   becomes the bridge — less clever, completely reliable.
3. **Difficulty.** Should the level be solvable without ever causing a paradox (current plan), or
   should one forced paradox chase be part of the route, as the tutorial for singularities?
4. **Budget.** 60 s of timeline is generous for four beats but each rehearsal-run costs seconds. If
   playtests get tight, the level's timeline can be extended per level rather than globally.
