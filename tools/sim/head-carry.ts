/**
 * A crate landing on a former self's head, and whether it rides.
 *
 * Ghosts are solid to objects — "crates rest on them and are shoved by them" — so a
 * crate dropped onto one should travel with it. The live body is not solid to
 * objects, so the crate falls straight through it and lands on the floor; the replay
 * is where the carrying has to show up.
 */
import { NO_INPUT } from '../../src/core/world';
import type { Box } from '../../src/core/world';
import { boxRect } from '../../src/core/world';
import { supportUnder } from '../../src/core/physics';
import type { SolidRect } from '../../src/core/physics';
import { argv, buildWorld, hold, run, snapshot } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const FLOOR = GROUND_ROW * 32;
const SPAWN_X = 6 * 32;
/** Placed so the crate reaches the ground just as the body passes beneath it. */
const DROP_X = Number(argv[0] ?? 600);
/** How many crates are stacked in the drop. */
const STACK = Number(argv[1] ?? 1);
const RELEASE = 90;

function flat(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let r = '';
    for (let x = 0; x < COLS; x++) r += y >= GROUND_ROW || x === 0 || x === COLS - 1 ? '#' : '.';
    rows.push(r);
  }
  return rows;
}

// The crate hangs above the path and is let go once the body is under it.
const scene: Scenario = {
  rows: flat(),
  spawn: { x: SPAWN_X, y: FLOOR - 26 },
  boxes: Array.from({ length: STACK }, (_, i) => ({
    x: DROP_X,
    y: FLOOR - 200 - i * 28,
    w: 28,
    h: 28,
    releaseTick: RELEASE,
  })),
};

const TICKS = 220;
const w = buildWorld(scene);
run(w, TICKS, hold({ right: true }));

w.splitRun();
w.scrubTo(0);
w.player.x = 2 * 32;
w.player.y = FLOOR - 26;
w.player.vx = 0;
w.player.vy = 0;
const api = w as unknown as { otherBoxSolids(b: Box): SolidRect[]; boxIsFalling(b: Box): boolean };

const replay = [snapshot(w)];
let restedOnGhost = 0;
let carriedWhileResting = 0;
let prevX = w.boxes.map((b) => b.state.x);
const carried = w.boxes.map(() => 0);
let spread = 0;
for (let i = 0; i < TICKS; i++) {
  w.step(NO_INPUT);
  replay.push(snapshot(w));
  const g = w.ghostSolidsAt(w.now)[0];
  if (g) {
    // The stack stands on the head if the lowest crate does.
    const r = boxRect(w.boxes[0]);
    const onHead = Math.abs(r.y + r.h - g.y) < 2 && r.x < g.x + g.w && r.x + r.w > g.x;
    if (onHead) {
      restedOnGhost++;
      w.boxes.forEach((bx, i) => {
        if (Math.abs(bx.state.x - prevX[i]) > 0.01) carried[i]++;
      });
      carriedWhileResting = carried[0];
      const xs = w.boxes.map((bx) => bx.state.x);
      spread = Math.max(spread, Math.max(...xs) - Math.min(...xs));
    }
  }
  prevX = w.boxes.map((bx) => bx.state.x);
}

console.log(`stack of ${STACK}: ticks the stack stood on the ghost's head : ${restedOnGhost}`);
w.boxes.forEach((_, i) => {
  console.log(`  crate #${i} (${i === 0 ? 'on the head' : `${i} up`}) carried on ${carried[i]} of them`);
});
console.log(`  worst lean across the stack while riding : ${spread.toFixed(2)}px`);
void carriedWhileResting;
void api;
void supportUnder;
console.log(`\n   t   ` + w.boxes.map((_, i) => `#${i} x,y`.padStart(16)).join('') + `   ghost x`);
for (const t of [RELEASE + 20, RELEASE + 40, RELEASE + 70, TICKS]) {
  const g = replay[t]?.ghosts[0];
  console.log(
    `  ${String(t).padStart(3)}  ` +
      replay[t].boxes.map((b) => `${b.x.toFixed(1)},${b.y.toFixed(1)}`.padStart(16)).join('') +
      `   ${(g?.x ?? -1).toFixed(1).padStart(7)}`,
  );
}
