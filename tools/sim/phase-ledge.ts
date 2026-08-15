/**
 * A former self running full speed off a phase block, then judged through the
 * rewind — the anachroverter case.
 *
 * The shelf ends in a phase block rather than a tile: the run crosses it while
 * it is solid and goes off its far edge at speed. Reaching the pad and reversing
 * turns that run into a ghost retracing the fall backwards — the first time any
 * of those poses is judged. Nothing here contradicts anything: the block is
 * solid the whole time, lived and replayed, so every paradox reported is false.
 *
 * The control at the end is the paradox that must survive any forgiveness here:
 * the live body stands in a button mid-rewind and closes a wall across the
 * ghost's recorded fall, which the ghost then arcs deep into.
 *
 *   npm run sim -- phase-ledge
 */
import { NO_INPUT, playerRect } from '../../src/core/world';
import type { PhaseSpec } from '../../src/core/world';
import { buildWorld, hold } from './harness';
import type { Scenario } from './harness';
import { SHELF_ROW, ledgeMap } from './scenarios';

const SHELF_Y = SHELF_ROW * 32;
// The shelf's tiles stop two columns short; a phase block is the last stretch.
const BLOCK_COL = 26;
const block: PhaseSpec = {
  rect: { x: BLOCK_COL * 32, y: SHELF_Y, w: 64, h: 32 },
  group: 0,
  // Solid while group 0's button is up — and nothing ever presses it.
  inverted: false,
};
// Open space the lived fall passes through, unless group 1's button is held.
const trap: PhaseSpec = {
  rect: { x: 29 * 32, y: 18 * 32, w: 64, h: 64 },
  group: 1,
  inverted: true,
};

const scene: Scenario = {
  rows: ledgeMap(BLOCK_COL),
  spawn: { x: 22 * 32, y: SHELF_Y - 26 },
  boxes: [],
  buttons: [{ rect: { x: 4 * 32, y: SHELF_Y - 6, w: 32, h: 6 }, group: 1 }],
  phase: [block, trap],
};

/**
 * Whether the run's last grounded stride leaves a corner graze in the record is
 * a matter of phase against the block's edge: the first falling pose can lap
 * the corner by a fraction of a pixel on both axes. Sweep spawn offsets so
 * every alignment gets lived, exactly as `floating-sweep` does.
 */
let bad = 0;
for (const offset of [0, 4, 7, 10, 13, 16, 19, 22, 26, 29]) {
  const w = buildWorld({ ...scene, spawn: { x: scene.spawn.x + offset, y: scene.spawn.y } });
  let deepest = 0;
  for (let t = 0; t < 200; t++) {
    w.step(hold({ right: true }));
    const r = playerRect(w.player);
    const dx = Math.min(r.x + r.w, block.rect.x + block.rect.w) - Math.max(r.x, block.rect.x);
    const dy = Math.min(r.y + r.h, block.rect.y + block.rect.h) - Math.max(r.y, block.rect.y);
    if (dx > 0 && dy > 0) deepest = Math.max(deepest, Math.min(dx, dy));
  }

  // The pad: the recording closes, time reverses, and the body walks clear.
  w.splitRun();
  w.dir = -1;
  w.player.x = 2 * 32;
  w.player.y = SHELF_Y - 26;
  w.player.vx = 0;
  w.player.vy = 0;

  const judge = (ticks: number): string[] => {
    const found: string[] = [];
    for (let t = 0; t < ticks && w.now > 1; t++) {
      w.step(NO_INPUT);
      const p = w.detectParadox();
      if (p) found.push(`t=${w.now} y=${p.y.toFixed(1)} ${p.reason}`);
    }
    return found;
  };

  const back = judge(200);
  w.dir = 1;
  const fwd = judge(200);
  const hits = [...back.map((h) => `rewind ${h}`), ...fwd.map((h) => `replay ${h}`)];
  console.log(
    `x+${String(offset).padStart(2)}: lived graze ${deepest.toFixed(2)}px, ` +
      `${hits.length} paradox tick(s)`,
  );
  for (const h of hits.slice(0, 3)) console.log(`    ${h}`);
  if (hits.length) bad++;
}
console.log(`\n10 alignments, ${bad} with a paradox in them (all are false)`);

// The control: the same run, but this time the live body walks off the pad and
// stands in the button, closing the trap across the fall the ghost has yet to
// retrace. That is a wall materialising through recorded history, and it must
// still be caught.
const w = buildWorld({ ...scene, spawn: { x: scene.spawn.x + 10, y: scene.spawn.y } });
for (let t = 0; t < 200; t++) w.step(hold({ right: true }));
w.splitRun();
w.dir = -1;
w.player.x = 4 * 32 + 6;
w.player.y = SHELF_Y - 26;
w.player.vx = 0;
w.player.vy = 0;
let caught = 'none';
for (let t = 0; t < 200 && w.now > 1 && caught === 'none'; t++) {
  w.step(NO_INPUT);
  const p = w.detectParadox();
  if (p) caught = `t=${w.now} ${p.reason}`;
}
console.log(`control, wall closed on the ghost's fall: ${caught}`);
