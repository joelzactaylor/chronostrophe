/**
 * A button worked while time runs backwards, and what it costs.
 *
 * Reverse playback restores the solidity each tick was recorded with, which is a
 * second authority over the same blocks: this checks that standing in a button
 * now beats what the recording says, and that the crate whose block is pulled out
 * from under it is caught resting on nothing rather than left hanging there.
 *
 *   npm run sim -- reverse-button          # the whole sequence
 *   npm run sim -- reverse-button undo     # step back off the button partway
 */
import { TILE } from '../../src/core/types';
import { argv, buildWorld, hold } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const FLOOR = GROUND_ROW * TILE;
const BUTTON_CX = 4;
// One phase block up in the air with a crate parked on it, well away from the
// button and from anything the body does.
const BLOCK_CX = 20;
const BLOCK_ROW = GROUND_ROW - 5;

const rows: string[] = [];
for (let y = 0; y < ROWS; y++) {
  let r = '';
  for (let x = 0; x < COLS; x++) r += y >= GROUND_ROW || x === 0 || x === COLS - 1 ? '#' : '.';
  rows.push(r);
}

const scene: Scenario = {
  rows,
  spawn: { x: 10 * TILE, y: FLOOR - 26 },
  boxes: [{ x: BLOCK_CX * TILE + 2, y: BLOCK_ROW * TILE - 28, w: 28, h: 28 }],
  buttons: [{ rect: { x: BUTTON_CX * TILE, y: FLOOR - 6, w: TILE, h: 6 }, group: 0 }],
  phase: [{ rect: { x: BLOCK_CX * TILE, y: BLOCK_ROW * TILE, w: TILE, h: TILE }, group: 0, inverted: false }],
};

const w = buildWorld(scene);
const crate = w.boxes[0];
const line = (label: string): void => {
  const p = w.crateParadoxes[0];
  console.log(
    `  ${label.padEnd(24)} t=${String(w.now).padStart(4)} pressed=${w.isPressed(0) ? 'yes' : 'no '} ` +
      `solid=${w.isSolidPhase(w.phase[0]) ? 'yes' : 'no '} crate y=${crate.state.y.toFixed(1).padStart(6)} ` +
      `torn=${w.isBroken(crate) ? 'yes' : 'no '} unwritten to=${p ? p.tick : '—'}`,
  );
};

// Forward, nowhere near the button: the crate sits on its block and is recorded there.
console.log('forward, the button untouched');
for (let t = 0; t < 200; t++) w.step(hold({ right: true }));
line('200 ticks lived');

// Backwards, standing in the button: the block its whole history rests on goes.
w.splitRun();
w.dir = -1;
w.player.x = BUTTON_CX * TILE + 6;
w.player.y = FLOOR - 26;
w.player.vx = 0;
w.player.vy = 0;
console.log('backward, standing in the button');
const judge = (): void => {
  for (const id of w.floatingBoxIds()) w.breakCrate(id);
};
w.step(hold({}));
judge();
line('one tick');
for (let t = 0; t < 4; t++) {
  w.step(hold({}));
  judge();
}
line('five ticks');

if (argv[0] === 'undo') {
  // Step out of the button again: the block comes back, but the crate is already torn.
  w.player.x = 12 * TILE;
  for (let t = 0; t < 5; t++) {
    w.step(hold({}));
    judge();
  }
  line('off the button');
}

// Run it out: the unwriting reaches the start of the epoch and the level is over.
let over = -1;
for (let t = 0; t < 400 && over < 0; t++) {
  w.step(hold({}));
  judge();
  if (w.historyUnwritten()) over = t;
}
line('run out');
console.log(`  timeline came apart after ${over < 0 ? 'never' : `${over} more ticks`}`);
