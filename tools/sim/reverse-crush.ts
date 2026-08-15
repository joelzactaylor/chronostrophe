/**
 * A phase block must not materialise around the live body, whichever way time
 * is running.
 *
 * Forward, `updatePhaseSolids` guarantees it: a block that wants to become
 * solid waits while anything is inside it. Backward, the solidity comes from
 * `restorePhaseState` retracing the recording instead — and the recording is
 * the one thing that cannot know where the live body stands now. Here the run
 * shoves a crate onto a button, opening the block for the rest of the recording;
 * time is then reversed with the live body standing in the open slot. The
 * rewind crossing the shove tick restores the block to solid — around the body.
 *
 * The control parks the body clear of the slot: the block must still go solid
 * there, or the retrace itself is broken.
 *
 *   npm run sim -- reverse-crush
 */
import { NO_INPUT } from '../../src/core/world';
import type { Input } from '../../src/core/world';
import { buildWorld, hold } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const FLOOR = GROUND_ROW * 32;
const SLOT_X = 20 * 32;

const rows: string[] = [];
for (let y = 0; y < ROWS; y++) {
  let r = '';
  for (let x = 0; x < COLS; x++) r += y >= GROUND_ROW || x === 0 || x === COLS - 1 ? '#' : '.';
  rows.push(r);
}
const scene: Scenario = {
  rows,
  spawn: { x: 4 * 32, y: FLOOR - 26 },
  boxes: [{ x: 6 * 32, y: FLOOR - 28, w: 28, h: 28 }],
  buttons: [{ rect: { x: 8 * 32, y: FLOOR - 6, w: 32, h: 6 }, group: 0 }],
  // A slot on the floor: solid while the button is up, open once the crate rests
  // in it.
  phase: [{ rect: { x: SLOT_X, y: FLOOR - 32, w: 32, h: 32 }, group: 0, inverted: false }],
};

function judge(label: string, parkX: number, live: (t: number) => Input = () => NO_INPUT): void {
  const w = buildWorld(scene);
  // Shove the crate onto the button, then let go and stand: the block is solid
  // until the shove lands, open for the rest of the recording.
  let pressedAt = -1;
  for (let t = 0; t < 200; t++) {
    w.step(pressedAt < 0 ? hold({ right: true }) : NO_INPUT);
    if (pressedAt < 0 && w.pressed.has(0)) pressedAt = w.now;
  }
  if (pressedAt < 0) throw new Error('the crate never reached the button');

  // Reverse, with the live body standing at parkX.
  w.splitRun();
  w.dir = -1;
  w.player.x = parkX;
  w.player.y = FLOOR - 26;
  w.player.vx = 0;
  w.player.vy = 0;

  let crushedAt = -1;
  let solidAt = -1;
  for (let t = 0; t < 220 && w.now > 1; t++) {
    w.step(live(t));
    if (solidAt < 0 && w.isSolidPhase(w.phase[0])) solidAt = w.now;
    if (crushedAt < 0 && w.crushed) crushedAt = w.now;
  }
  console.log(
    `${label} button pressed t=${pressedAt}; rewound to t=${w.now}: ` +
      `block solid ${solidAt < 0 ? 'never' : `from t=${solidAt}`}, ` +
      `${crushedAt < 0 ? 'body unharmed' : `BODY CRUSHED at t=${crushedAt}`}`,
  );
}

// The body stands in the open slot while the rewind crosses the shove.
judge('body in the slot   ', SLOT_X + 6);
// The control: parked clear, the block must still retrace to solid.
judge('body clear of it   ', 24 * 32);
// The exception holds only while it must: the body waits in the slot through
// the crossing, then walks out — and the block goes solid behind it.
judge('body steps out late', SLOT_X + 6, (t) => (t > 180 ? hold({ right: true }) : NO_INPUT));
