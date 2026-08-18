/**
 * A row shoved into a row standing a few pixels lower.
 *
 * Crates are 28px on a 32px grid, so two rows are only ever exactly level when
 * they stand on the same thing: a crate on a one-tile step is 4px above one
 * standing on a crate below that step, 8px for a two-tile step, and so on. Those
 * rows are flush and in contact, and the shove has to carry through.
 *
 *   npm run sim -- step-push [ticks]
 */
import { boxRect } from '../../src/core/world';
import type { Box } from '../../src/core/world';
import { argv, buildWorld, crateAt, hold } from './harness';
import type { Scenario } from './harness';

const TICKS = Number(argv[0] ?? 240);
const COLS = 60;
const ROWS = 30;
/** The lower floor, and the one-tile step the shove starts on. */
const GROUND_ROW = 20;
const STEP_ROW = GROUND_ROW - 1;
const STEP_END = 30;
const STEP_TOP = STEP_ROW * 32;
const GROUND_TOP = GROUND_ROW * 32;
const EDGE = STEP_END * 32;

/** The step on the left, the lower floor everywhere, and an optional pillar. */
function stepMap(pillarCol = -1): string[] {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let row = '';
    for (let x = 0; x < COLS; x++) {
      const step = y >= STEP_ROW && x < STEP_END;
      const pillar = y >= STEP_ROW && x === pillarCol;
      row += y >= GROUND_ROW || step || pillar || x === 0 ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Two crates on the step, shoved into two standing on crates on the floor below
 * it — 4px lower, and flush against them.
 */
function stepScenario(pillarCol = -1): Scenario {
  return {
    rows: stepMap(pillarCol),
    spawn: { x: EDGE - 200, y: STEP_TOP - 26 },
    boxes: [
      crateAt(EDGE - 56, STEP_TOP - 28),
      crateAt(EDGE - 28, STEP_TOP - 28),
      crateAt(EDGE, GROUND_TOP - 56),
      crateAt(EDGE + 28, GROUND_TOP - 56),
      crateAt(EDGE, GROUND_TOP - 28),
      crateAt(EDGE + 28, GROUND_TOP - 28),
    ],
  };
}

interface ChainApi { pushChain(box: Box, dx: number, dy: number): Box[] }

// 1. Which neighbours a chain reaches, crate by crate: level or lower while the
//    faces still meet, and nothing above or a whole crate below.
console.log('offset  chain');
for (const dy of [-28, -8, -4, -2, 0, 2, 4, 8, 24, 26, 28]) {
  const probe = buildWorld({
    rows: stepMap(),
    spawn: { x: 200, y: STEP_TOP - 26 },
    boxes: [crateAt(500, STEP_TOP - 28), crateAt(528, STEP_TOP - 28 + dy)],
  });
  const chain = (probe as unknown as ChainApi).pushChain(probe.boxes[0], 1, 0);
  console.log(`${String(dy).padStart(4)}px  ${chain.length === 2 ? 'reaches the crate ahead' : 'stops short'}`);
}

// 2. The shove itself: the front row has to travel, and the body behind it has to
//    keep walking rather than stopping dead against a row it is flush with.
const run = (pillarCol: number): { world: ReturnType<typeof buildWorld>; startX: number[]; overlap: number } => {
  const scenario = stepScenario(pillarCol);
  const world = buildWorld(scenario);
  const startX = world.boxes.map((b) => b.state.x);
  let overlap = 0;
  for (let t = 0; t < TICKS; t++) {
    world.step(hold({ right: true }));
    for (let i = 0; i < world.boxes.length; i++) {
      for (let j = i + 1; j < world.boxes.length; j++) {
        const a = boxRect(world.boxes[i]);
        const b = boxRect(world.boxes[j]);
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0 && oy > 0) overlap = Math.max(overlap, Math.min(ox, oy));
      }
    }
  }
  return { world, startX, overlap };
};

const report = (title: string, r: ReturnType<typeof run>): void => {
  console.log(`\n${title}`);
  console.log('  crate   moved   final');
  for (const b of r.world.boxes) {
    const rect = boxRect(b);
    console.log(`    #${b.id}  ${(b.state.x - r.startX[b.id]).toFixed(2).padStart(7)}   x=${rect.x.toFixed(2)} y=${rect.y.toFixed(2)}`);
  }
  console.log(`  body x ${r.world.player.x.toFixed(2)} (spawn ${EDGE - 200})  crushed=${r.world.crushed}  deepest crate overlap ${r.overlap.toFixed(2)}px`);
};

report('shoved into the lower row', run(-1));
// The same shove with the front row's bottom 4px caught on a pillar: the row is
// jammed against level geometry, and everything behind it has to stop there.
report(`front row caught on a pillar at x=${33 * 32}`, run(33));
