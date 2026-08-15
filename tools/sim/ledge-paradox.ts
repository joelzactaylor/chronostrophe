/**
 * A former self running full speed off a ledge, judged on every tick of the
 * replay and of the rewind.
 *
 * Nothing here contradicts anything: the run is replayed into the same world it
 * was lived in, with the body parked out of the way. Every paradox this reports
 * is a false one.
 */
import { NO_INPUT } from '../../src/core/world';
import { buildWorld, hold } from './harness';
import type { Scenario } from './harness';
import { GROUND_ROW, SHELF_ROW, ledgeMap } from './scenarios';

const scene: Scenario = {
  // Start a couple of seconds short of the end of the shelf, so the run leaves it
  // early and the fall, the landing and the ground run all sit inside the replay.
  rows: ledgeMap(),
  spawn: { x: 22 * 32, y: SHELF_ROW * 32 - 26 },
  boxes: [],
};

const w = buildWorld(scene);
// Full speed off the end of the shelf, then along the ground below it.
let leftLedge = -1;
for (let t = 0; t < 240; t++) {
  w.step(hold({ right: true }));
  if (leftLedge < 0 && w.player.y > SHELF_ROW * 32 - 26) leftLedge = w.now;
}
console.log(
  `lived to t=${w.now}, off the ledge at t=${leftLedge}, body at ` +
    `${w.player.x.toFixed(1)},${w.player.y.toFixed(1)}`,
);
w.splitRun();

// Park the live body somewhere it cannot touch anything, and replay the run.
w.scrubTo(0);
w.player.x = 2 * 32;
w.player.y = SHELF_ROW * 32 - 26;
w.player.vx = 0;
w.player.vy = 0;

const hits: { t: number; reason: string; y: number }[] = [];
for (let t = 0; t < 240; t++) {
  w.step(NO_INPUT);
  const p = w.detectParadox();
  if (p) hits.push({ t: w.now, reason: p.reason, y: p.y });
}
console.log(`replaying forward: ${hits.length} paradox tick(s)`);
for (const h of hits.slice(0, 8)) console.log(`  t=${h.t} y=${h.y.toFixed(1)} ${h.reason}`);

// And the same stretch backwards.
w.dir = -1;
const back: { t: number; reason: string; y: number }[] = [];
for (let t = 0; t < 240; t++) {
  w.step(NO_INPUT);
  const p = w.detectParadox();
  if (p) back.push({ t: w.now, reason: p.reason, y: p.y });
}
console.log(`rewinding: ${back.length} paradox tick(s)`);
for (const h of back.slice(0, 8)) console.log(`  t=${h.t} y=${h.y.toFixed(1)} ${h.reason}`);

// Where the ledge and the ground are, for reading the y values above.
console.log(`shelf top y=${SHELF_ROW * 32}, ground top y=${GROUND_ROW * 32}`);
