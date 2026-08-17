/**
 * A crate on a phase block, scrubbed forward past the tick the block opens.
 *
 * The lived run walks into a button, which turns a phase block passable and drops
 * the crate it was holding onto the ground. Reversing back up the timeline puts
 * the crate back on the block, exactly as history had it. Scrubbing forward again
 * across the press must drop the crate the same way it dropped when it was lived:
 * the ghost stands in the button partway through the scrubbed stretch, the block
 * opens there, and the crate falls from there.
 *
 * Two separate faults live here, so the check drives the scrub two ways.
 *
 * `whole` is one drag from well before the press to well after it — the case that
 * caught `simulateBoxesTo` carrying one solidity across the entire stretch.
 *
 * `incremental` is what a hand on the slider actually does: a tick at a time, with
 * the crates judged between each, exactly as `GameScene.tickBody` judges them on
 * every paused update. This is the case that catches the judgement itself firing
 * on the tick the block opens, before the timeline has run far enough for the
 * crate to have fallen anywhere.
 *
 *   npm run sim -- scrub-phase-crate
 */
import { NO_INPUT } from '../../src/core/world';
import type { PhaseSpec } from '../../src/core/world';
import { buildWorld, crateAt, hold } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const BUTTON_COL = 20;
const BLOCK_COL = 30;
const BLOCK_Y = 20 * 32;
const RESTING = BLOCK_Y - 28;

function map(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let row = '';
    for (let x = 0; x < COLS; x++) row += y >= GROUND_ROW || x === 0 ? '#' : '.';
    rows.push(row);
  }
  return rows;
}

/** Solid while group 0's button is up; the crate rides it until someone stands in it. */
const block: PhaseSpec = {
  rect: { x: BLOCK_COL * 32, y: BLOCK_Y, w: 64, h: 32 },
  group: 0,
  inverted: false,
};

const scene: Scenario = {
  rows: map(),
  spawn: { x: 8 * 32, y: GROUND_ROW * 32 - 26 },
  boxes: [crateAt(BLOCK_COL * 32 + 2, BLOCK_Y - 28)],
  // Wide enough that a walking body is in it long enough to see the crate all the
  // way down, and to be scrubbed to while it is still standing there.
  buttons: [{ rect: { x: BUTTON_COL * 32, y: GROUND_ROW * 32 - 6, w: 128, h: 6 }, group: 0 }],
  phase: [block],
};

type W = ReturnType<typeof buildWorld>;
const crateY = (w: W): number => w.boxes[0].state.y;

/**
 * Walks right until the button opens the block and the crate has hit the ground,
 * then closes the run and parks the body clear of the button — the pose the body
 * holds on a chronoporter pad while the player scrubs.
 */
function lived(): { w: W; pressedAt: number; releasedAt: number } {
  const w = buildWorld(scene);
  let pressedAt = -1;
  let releasedAt = -1;
  for (let t = 0; t < 200; t++) {
    w.step(hold({ right: true }));
    if (pressedAt < 0 && w.isPressed(0)) pressedAt = w.now;
    if (pressedAt > 0 && releasedAt < 0 && !w.isPressed(0)) releasedAt = w.now;
  }
  w.splitRun();
  w.player.x = 3 * 32;
  w.player.y = GROUND_ROW * 32 - 26;
  w.player.vx = 0;
  w.player.vy = 0;
  w.step(NO_INPUT);
  // Time is reversed and the body is parked on the pad: the state the player
  // scrubs from.
  w.dir = -1;
  return { w, pressedAt, releasedAt };
}

const probe = lived();
const { pressedAt, releasedAt } = probe;
console.log(
  `lived: ghost is in the button t=${pressedAt}..${releasedAt}, ` +
    `crate fell to y=${crateY(probe.w).toFixed(1)} (was ${RESTING} on the block)`,
);

const back = pressedAt - 30;
const forward = Math.floor((pressedAt + releasedAt) / 2);

// One drag across the whole stretch.
{
  const { w } = lived();
  w.scrubTo(back);
  w.scrubTo(forward);
  const floating = w.floatingBoxIds();
  console.log(
    `\nwhole:       t=${back} -> t=${forward} in one go: crate y=${crateY(w).toFixed(1)} ` +
      `block=${w.isSolidPhase(block) ? 'solid' : 'open'} ` +
      `${floating.length ? `FLOATING PARADOX ${JSON.stringify(floating)}` : 'ok'}`,
  );
}

// A tick at a time, judged between each, the way the slider and the paused update
// loop actually interleave.
{
  const { w } = lived();
  w.scrubTo(back);
  const hits: string[] = [];
  for (let t = back + 1; t <= forward; t++) {
    w.scrubTo(t);
    for (const id of w.floatingBoxIds()) {
      hits.push(`t=${t} crate#${id} y=${crateY(w).toFixed(1)} block=${w.isSolidPhase(block) ? 'solid' : 'open'}`);
    }
  }
  console.log(
    `incremental: t=${back} -> t=${forward} a tick at a time: crate y=${crateY(w).toFixed(1)} ` +
      `${hits.length ? `FLOATING PARADOX on ${hits.length} tick(s)` : 'ok'}`,
  );
  for (const h of hits.slice(0, 6)) console.log(`               ${h}`);
  console.log(
    `\n(the block opens at t=${pressedAt}; history has the crate still up at ${RESTING} there, ` +
      `falling over the ticks after)`,
  );
}
