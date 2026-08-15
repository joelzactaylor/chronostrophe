/**
 * The ways a body is meant to be crushed, and the ways it is not. Run against
 * two builds of the physics to check that making depenetration minimal did not
 * quietly let a buried body sit inside what buried it.
 */
import { TILE } from '../../src/core/types';
import { Input, NO_INPUT, playerRect } from '../../src/core/world';
import { buildWorld, crateAt } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';
import { rectsOverlap } from '../../src/core/types';

function flatMap(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let row = '';
    for (let x = 0; x < COLS; x++) row += y >= GROUND_ROW || x === 0 || x === COLS - 1 ? '#' : '.';
    rows.push(row);
  }
  return rows;
}

const FLOOR = GROUND_ROW * TILE;

/** A stone hung over the body's head and let go. */
function monolithOnHead(offsetX: number): Scenario {
  return {
    rows: flatMap(),
    spawn: { x: 10 * TILE, y: FLOOR - 26 },
    boxes: [
      { x: 10 * TILE - 2 * TILE + offsetX, y: FLOOR - 32 * 8, w: 4 * TILE, h: 3 * TILE, immovable: true, releaseTick: 10 },
    ],
  };
}

/** A stone let go over a crate: the crate takes its weight and holds it up. */
function monolithOnCrateBesideBody(): Scenario {
  return {
    rows: flatMap(),
    spawn: { x: 10 * TILE, y: FLOOR - 26 },
    boxes: [
      crateAt(10 * TILE + 20 + 0.02, FLOOR - 28),
      { x: 10 * TILE, y: FLOOR - 32 * 8, w: 4 * TILE, h: 3 * TILE, immovable: true, releaseTick: 10 },
    ],
  };
}

/** Walking into a wall: firm contact, and no crushing. */
function wallRun(): Scenario {
  const rows = flatMap();
  return { rows, spawn: { x: (COLS - 6) * TILE, y: FLOOR - 26 }, boxes: [] };
}

/** Shoving a row of crates into a wall: the body is stopped, not crushed. */
function crateIntoWall(): Scenario {
  return {
    rows: flatMap(),
    spawn: { x: (COLS - 10) * TILE, y: FLOOR - 26 },
    boxes: [0, 1, 2].map((i) => crateAt((COLS - 8) * TILE + i * 28, FLOOR - 28)),
  };
}

/** A stack of crates the body is standing under as the top one is shoved off. */
function underStack(): Scenario {
  return {
    rows: flatMap(),
    spawn: { x: 10 * TILE, y: FLOOR - 26 },
    boxes: [crateAt(10 * TILE, FLOOR - 28 * 3), crateAt(10 * TILE, FLOOR - 28 * 4)],
  };
}

const CASES: { name: string; scenario: Scenario; input: Input; expectCrush: boolean }[] = [
  { name: 'monolith straight down', scenario: monolithOnHead(0), input: NO_INPUT, expectCrush: true },
  { name: 'monolith clipping edge', scenario: monolithOnHead(52), input: NO_INPUT, expectCrush: true },
  // A crate directly underneath is the one thing that stops a stone, so the body
  // beside it is never reached. See the monoliths section of the README.
  { name: 'monolith onto crate', scenario: monolithOnCrateBesideBody(), input: NO_INPUT, expectCrush: false },
  { name: 'walk into wall', scenario: wallRun(), input: { ...NO_INPUT, right: true }, expectCrush: false },
  { name: 'crates into wall', scenario: crateIntoWall(), input: { ...NO_INPUT, right: true }, expectCrush: false },
  // A crate coming down on a body standing on the floor has it against the ground
  // with nowhere to go either side: that is a crushing.
  { name: 'crate falls on head', scenario: underStack(), input: NO_INPUT, expectCrush: true },
];

let bad = 0;
for (const c of CASES) {
  const w = buildWorld(c.scenario);
  let crushedAt = -1;
  let buriedAt = -1;
  for (let t = 0; t < 180; t++) {
    w.step(c.input);
    if (crushedAt < 0 && w.crushed) crushedAt = t;
    if (buriedAt < 0) {
      const pr = playerRect(w.player);
      // Left sitting inside something solid is as bad as an undetected crush.
      const inside = w.boxes.some((b) => {
        const r = { x: b.state.x, y: b.state.y, w: b.w, h: b.h };
        const over = rectsOverlap(pr, r);
        if (!over) return false;
        const ox = Math.min(pr.x + pr.w, r.x + r.w) - Math.max(pr.x, r.x);
        const oy = Math.min(pr.y + pr.h, r.y + r.h) - Math.max(pr.y, r.y);
        return Math.min(ox, oy) > 1;
      });
      if (inside) buriedAt = t;
    }
  }
  const ok = c.expectCrush === crushedAt >= 0;
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(24)} crushed@${String(crushedAt).padStart(4)} ` +
      `(expected ${c.expectCrush ? 'crush' : 'no crush'})  first buried in a crate@${String(buriedAt).padStart(4)}` +
      `  final body ${w.player.x.toFixed(2)},${w.player.y.toFixed(2)}`,
  );
}
console.log(bad === 0 ? '\nall crush cases behave as expected' : `\n${bad} case(s) wrong`);
