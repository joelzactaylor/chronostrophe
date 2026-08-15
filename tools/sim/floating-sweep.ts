/**
 * A hunt for false floating paradoxes.
 *
 * Every case here is a run replayed into the world it was lived in, with the live
 * body parked out of reach: nothing is contradicted, so any paradox reported is a
 * false one. The cases vary how the run leaves the ledge (walked off, jumped off,
 * at a different phase against the tile grid) and which way time was running when
 * it was lived and when it is replayed, because "sometimes" usually means a phase.
 */
import { NO_INPUT } from '../../src/core/world';
import type { Input } from '../../src/core/world';
import { buildWorld, hold } from './harness';
import type { Scenario } from './harness';
import { SHELF_ROW, ledgeMap } from './scenarios';

const SHELF_Y = SHELF_ROW * 32;

interface Case {
  name: string;
  startX: number;
  jump: boolean;
  livedBackwards: boolean;
}

function build(c: Case) {
  const scene: Scenario = {
    rows: ledgeMap(),
    spawn: { x: c.startX, y: SHELF_Y - 26 },
    boxes: [],
  };
  return buildWorld(scene);
}

/** Run right, and hop every 40 ticks if this case jumps. */
const input = (c: Case) => (t: number): Input =>
  c.jump ? { ...NO_INPUT, right: true, jump: t % 40 < 8, jumpPressed: t % 40 === 0 } : hold({ right: true });

/** Replays or rewinds `ticks` ticks with the body parked, collecting paradoxes. */
function judge(w: ReturnType<typeof buildWorld>, ticks: number): string[] {
  const found: string[] = [];
  for (let t = 0; t < ticks; t++) {
    w.step(NO_INPUT);
    const p = w.detectParadox();
    if (p) found.push(`t=${w.now} ${p.reason}`);
  }
  return found;
}

const cases: Case[] = [];
for (const startX of [22 * 32, 22 * 32 + 7, 22 * 32 + 13, 22 * 32 + 19, 22 * 32 + 26]) {
  for (const jump of [false, true]) {
    for (const livedBackwards of [false, true]) {
      cases.push({
        name: `x+${startX - 22 * 32} ${jump ? 'hopping' : 'walking '} ${livedBackwards ? 'lived backwards' : 'lived forwards'}`,
        startX,
        jump,
        livedBackwards,
      });
    }
  }
}

let bad = 0;
for (const c of cases) {
  const w = build(c);
  const run = input(c);
  if (c.livedBackwards) {
    // Get some timeline under it, then live the ledge run with time reversed.
    for (let t = 0; t < 200; t++) w.step(NO_INPUT);
    w.splitRun();
    w.dir = -1;
    for (let t = 0; t < 190; t++) w.step(run(t));
  } else {
    for (let t = 0; t < 200; t++) w.step(run(t));
  }
  w.splitRun();

  // Park the body somewhere it cannot reach anything the run touched.
  const parkAt = Math.min(w.now, 190);
  w.dir = 1;
  w.scrubTo(Math.max(1, w.now - parkAt));
  w.player.x = 2 * 32;
  w.player.y = SHELF_Y - 26;
  w.player.vx = 0;
  w.player.vy = 0;

  const forward = judge(w, 180);
  w.dir = -1;
  const backward = judge(w, 180);
  const hits = [...forward.map((h) => `replay ${h}`), ...backward.map((h) => `rewind ${h}`)];
  if (hits.length) {
    bad++;
    console.log(`${c.name}: ${hits.length} paradox tick(s)`);
    for (const h of hits.slice(0, 4)) console.log(`    ${h}`);
  }
}
console.log(`\n${cases.length} cases, ${bad} with a paradox in them`);
