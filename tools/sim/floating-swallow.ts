/**
 * The paradoxes the floating slack must not swallow.
 *
 * The lateral slack in `restsOnSomething` is earned by name: only the crate a
 * ghost's record says it stood on may hold it up from beside the footprint.
 * Every case here moves that support away entirely and parks something *else*
 * within arm's reach at foot level — a stack, whose crate tops recur at every
 * height the way a wall's tiles do; a monolith, which cannot be nudged sideways;
 * a monolith not even released yet. None of them was ever the body's footing, so
 * every one of these must still be a paradox. The last case is the forgiveness
 * the slack exists for, and must stay quiet: the support itself slid clear of
 * the footprint, but it is still the crate the record stood on.
 *
 *   npm run sim -- floating-swallow
 */
import { NO_INPUT } from '../../src/core/world';
import { buildWorld } from './harness';
import type { Scenario } from './harness';
import type { BoxSpec } from '../../src/core/world';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const FLOOR = GROUND_ROW * 32;
const CRATE_X = 12 * 32; // 384..412; neighbour column at 416..444
const NEIGHBOUR_X = CRATE_X + 32;

const rows: string[] = [];
for (let y = 0; y < ROWS; y++) {
  let r = '';
  for (let x = 0; x < COLS; x++) r += y >= GROUND_ROW || x === 0 || x === COLS - 1 ? '#' : '.';
  rows.push(r);
}

/**
 * Stands the body on `supports` for 90 ticks, hands the run to history, then
 * displaces every support by `dx` and judges the ghost against the neighbours.
 */
function judge(label: string, supports: BoxSpec[], neighbours: BoxSpec[], dx: number): void {
  const top = Math.min(...supports.map((b) => b.y));
  const scene: Scenario = {
    rows,
    // Footprint 380..400: >1px lip on the support, 16px clear of the neighbour
    // column at 416, well inside the 24px lateral slack.
    spawn: { x: 380, y: top - 26 },
    boxes: [...supports, ...neighbours],
  };
  const w = buildWorld(scene);
  for (let t = 0; t < 90; t++) w.step(NO_INPUT);
  w.splitRun();
  w.scrubTo(w.now - 10);
  for (let i = 0; i < supports.length; i++) w.boxes[i].state.x += dx;
  console.log(`${label} ${w.detectParadox()?.reason ?? 'none'}`);
}

const crateOnFloor: BoxSpec = { x: CRATE_X, y: FLOOR - 28, w: 28, h: 28 };
const GONE = 2 * 32 - CRATE_X;

// Nothing near: the paradox, plainly.
judge('support gone, nothing beside     ', [crateOnFloor], [], GONE);

// A stack of crates in the tile-adjacent column.
const stack: BoxSpec[] = [
  { x: NEIGHBOUR_X, y: FLOOR - 28, w: 28, h: 28 },
  { x: NEIGHBOUR_X, y: FLOOR - 56, w: 28, h: 28 },
  { x: NEIGHBOUR_X, y: FLOOR - 84, w: 28, h: 28 },
];
judge('support gone, stack beside       ', [crateOnFloor], stack, GONE);

// The body stood on a 2-high stack; both crates go; it hangs 56px up in the air
// beside the taller stack, whose middle crate top sits at its foot level.
judge('mid-air beside the stack         ', [
  crateOnFloor,
  { x: CRATE_X, y: FLOOR - 56, w: 28, h: 28 },
], stack, GONE);

// A monolith beside instead: immovable, so it can never be the crate the record
// stood on, settled sideways.
judge('support gone, monolith beside    ', [crateOnFloor], [
  { x: NEIGHBOUR_X, y: FLOOR - 28, w: 28, h: 28, immovable: true },
], GONE);

// A monolith still suspended, hanging beside the ghost and not yet part of play.
judge('suspended monolith beside        ', [crateOnFloor], [
  { x: NEIGHBOUR_X, y: FLOOR - 28, w: 28, h: 28, immovable: true, releaseTick: 100000 },
], GONE);

// The forgiveness itself: the support slid clear of the footprint, an arm's
// reach away rather than gone. Not a paradox — this is the crate it stood on.
judge('the support itself slid 26px     ', [crateOnFloor], [], 26);
