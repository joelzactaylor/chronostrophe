/**
 * Whether spikes kill from the poses that decide if they are as tall as they look.
 *
 * A crate is 28px in a 32px tile, so a crate settled in a spike pit leaves the top
 * 4px of the points sticking out of it: a body standing on that crate is visibly
 * impaled and has to die. A body on a ledge flush with the points is clear of them
 * and has to live, and one that only brushes the side of the run is grazing. The
 * poses come from the real deterministic step settling, not from arithmetic about
 * where the body ought to end up.
 */
import { TILE } from '../../src/core/types';
import type { Rect } from '../../src/core/types';
import { PLAYER_H, PLAYER_W, World, playerRect } from '../../src/core/world';
import { buildWorld, crate, hold, run } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

// GameScene reaches for the browser as it loads its music, so the kill rule is
// pulled in only once the smallest thing that looks like storage is in place.
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
};
const { hazardKills } = await import('../../src/game/GameScene');

const FLOOR = GROUND_ROW * TILE;
/** The tile the spikes fill, standing on the floor. */
const SPIKE_ROW = GROUND_ROW - 1;
const POINTS = SPIKE_ROW * TILE;
const PIT_X = 20;

/** Flat ground, with a one tile step up from `ledgeX` rightwards when asked for. */
function ground(ledgeX?: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let r = '';
    for (let x = 0; x < COLS; x++) {
      const ledge = ledgeX !== undefined && x >= ledgeX && y === SPIKE_ROW;
      r += y >= GROUND_ROW || ledge || x === 0 || x === COLS - 1 ? '#' : '.';
    }
    rows.push(r);
  }
  return rows;
}

/** Three tiles of floor spikes. */
const spikes: Rect[] = Array.from({ length: 3 }, (_, i) => ({
  x: (PIT_X + i) * TILE,
  y: POINTS,
  w: TILE,
  h: TILE,
}));

/** Lets a scenario settle, then judges the body where it comes to rest. */
function settle(label: string, scene: Scenario, ticks = 60): World {
  const w = buildWorld(scene);
  run(w, ticks, hold({}));
  const pr = playerRect(w.player);
  const dead = spikes.some((h) => hazardKills(pr, h, false));
  const feet = POINTS - (pr.y + pr.h);
  console.log(
    `${label.padEnd(36)} feet ${feet >= 0 ? `${feet.toFixed(2)}px clear of` : `${(-feet).toFixed(2)}px into`} the points   ${dead ? 'DIES' : 'lives'}`,
  );
  return w;
}

const from = (x: number, y: number, boxes: Scenario['boxes'] = [], ledgeX?: number): Scenario => ({
  rows: ground(ledgeX),
  spawn: { x, y },
  boxes,
});

const CRATE_TOP = FLOOR - 28;

// The pose the change is for: dropped onto a crate that has settled in the pit.
settle(
  'on a crate in the pit',
  from((PIT_X + 0.2) * TILE, CRATE_TOP - PLAYER_H - 20, [crate(PIT_X, GROUND_ROW)]),
);
// Same, offset so the body straddles the 2px bare strip at the tile's right edge.
settle(
  'on a crate, straddling the strip',
  from(PIT_X * TILE + 26, CRATE_TOP - PLAYER_H - 20, [crate(PIT_X, GROUND_ROW)]),
);
// A ledge whose surface is flush with the points: clear of them, and must stay so.
settle('on a ledge flush with the points', from((PIT_X + 4) * TILE, POINTS - PLAYER_H - 20, [], PIT_X + 3));
// On the floor, a hair short of the run: beside the spikes, never in them.
settle('on the floor beside the run', from(PIT_X * TILE - PLAYER_W, FLOOR - PLAYER_H, []));
// On the floor, 1px into the run: the graze the area rule exists to forgive.
settle('on the floor, 1px into the run', from(PIT_X * TILE - PLAYER_W + 1, FLOOR - PLAYER_H, []));
// On the floor in the middle of the run: wholly among the teeth.
settle('on the floor inside the run', from((PIT_X + 1) * TILE, FLOOR - PLAYER_H, []));
