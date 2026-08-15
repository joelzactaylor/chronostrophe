/**
 * A former self left standing on nothing.
 *
 * The floating test is deliberately slack — a body a hair clear of what holds it
 * is being replayed into a world that settled differently, not contradicting
 * anything — so this checks the slack has not swallowed the paradox it exists to
 * catch: a run that spent its time on a crate, and a crate that is no longer
 * there, is still impossible history.
 */
import { NO_INPUT } from '../../src/core/world';
import type { Input } from '../../src/core/world';
import { buildWorld, hold } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const FLOOR = GROUND_ROW * 32;
const CRATE_X = 12 * 32;

const rows: string[] = [];
for (let y = 0; y < ROWS; y++) {
  let r = '';
  for (let x = 0; x < COLS; x++) r += y >= GROUND_ROW || x === 0 || x === COLS - 1 ? '#' : '.';
  rows.push(r);
}
const scene: Scenario = {
  rows,
  spawn: { x: 6 * 32, y: FLOOR - 26 },
  boxes: [{ x: CRATE_X, y: FLOOR - 28, w: 28, h: 28 }],
};

/** Walk right, jump on tick `at`, and stand still once something is underfoot. */
const approach = (at: number) => (t: number): Input =>
  t < at ? hold({ right: true }) : { ...NO_INPUT, right: t < at + 14, jump: t < at + 8, jumpPressed: t === at };

// Find a jump that lands the body on the crate rather than shoving it along.
let jumpAt = -1;
for (let at = 20; at < 90 && jumpAt < 0; at++) {
  const probe = buildWorld(scene);
  const run = approach(at);
  for (let t = 0; t < at + 60; t++) probe.step(run(t));
  if (probe.player.groundedOn === 0) jumpAt = at;
}
if (jumpAt < 0) throw new Error('never got onto the crate');

const w = buildWorld(scene);
const run = approach(jumpAt);
for (let t = 0; t < jumpAt + 90; t++) w.step(run(t));
w.splitRun();
// Back into the stretch the body spent standing on the crate, which is where a
// scrub down the timeline leaves a former self doing the same.
w.scrubTo(w.now - 10);
const ghost = w.ghostsAt(w.now)[0];
console.log(
  `judging t=${w.now}: ${w.ghostsAt(w.now).length} former self, ` +
    `standing on ${ghost ? ghost.state.groundedOn : '—'}`,
);

const paradoxNow = (): string => w.detectParadox()?.reason ?? 'none';
console.log(`  crate where the run left it      ${paradoxNow()}`);

// Slack: the crate settles lower than the run recorded it, or slides clear of the
// footprint — the body stood on a 3px lip, so even the shortest slide leaves
// nothing underfoot at all, only the record's own crate within arm's reach. The
// body is over nothing by a strict reading, and none of it is history the world
// cannot produce.
const crate = w.boxes[0];
const restingY = crate.state.y;
const restingX = crate.state.x;
for (const drop of [3, 6, 12, 20]) {
  crate.state.y = restingY + drop;
  console.log(`  crate settled ${String(drop).padStart(2)}px lower         ${paradoxNow()}`);
}
crate.state.y = restingY;
for (const slide of [10, 18, 26]) {
  crate.state.x = restingX + slide;
  console.log(`  crate slid ${String(slide).padStart(2)}px along          ${paradoxNow()}`);
}
crate.state.x = restingX;

// Gone: the run spent its time standing on a crate that is not there any more.
crate.state.x = 2 * 32;
console.log(`  crate moved away entirely        ${paradoxNow()}`);
