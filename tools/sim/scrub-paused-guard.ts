/**
 * Guards on the phase-block bookkeeping the scrub and the frozen clock share.
 *
 * `scrubTo` and `stepPlayerFrozen` both let the tick's own record have the last
 * word on which blocks are solid, rather than deriving it from wherever the scrub
 * has just put the ghosts and crates. The restore deliberately declines to answer
 * for one thing — the live body's own standing in a button — because that is the
 * whole of how a body on a pad still opens a route. These cases hold both halves
 * of that down: the mechanic must still fire, and nothing else may.
 *
 *   npm run sim -- scrub-paused-guard
 */
import { NO_INPUT } from '../../src/core/world';
import type { PhaseSpec } from '../../src/core/world';
import { buildWorld, crateAt, hold } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const BUTTON_X = 20 * 32;
const BUTTON_W = 128;
const BLOCK_COL = 30;
const BLOCK_Y = 20 * 32;
const RESTING = BLOCK_Y - 28;
const GROUND_Y = GROUND_ROW * 32;

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
  spawn: { x: 8 * 32, y: GROUND_Y - 26 },
  boxes: [crateAt(BLOCK_COL * 32 + 2, BLOCK_Y - 28)],
  buttons: [{ rect: { x: BUTTON_X, y: GROUND_Y - 6, w: BUTTON_W, h: 6 }, group: 0 }],
  phase: [block],
};

type W = ReturnType<typeof buildWorld>;
const crateY = (w: W): number => w.boxes[0].state.y;

/**
 * A run that walks right and stops well short of the button, so the record has the
 * block solid throughout and the crate sitting on it the whole way. Returns the
 * world parked on a pad with time reversed, and the crate's lived height per tick.
 */
function lived(ticks: number): { w: W; y: number[] } {
  const w = buildWorld(scene);
  const y: number[] = [crateY(w)];
  for (let t = 0; t < ticks; t++) {
    // Stop before reaching the button, so nothing in the record ever presses it.
    w.step(t < 20 ? hold({ right: true }) : NO_INPUT);
    y[w.now] = crateY(w);
  }
  w.splitRun();
  w.dir = -1;
  w.paused = true;
  return { w, y };
}

/** Parks the live body at a pixel column on the ground. */
function park(w: W, x: number): void {
  w.player.x = x;
  w.player.y = GROUND_Y - 26;
  w.player.vx = 0;
  w.player.vy = 0;
}

const LIVE_TICKS = 200;
let bad = 0;
const report = (ok: boolean, name: string, detail: string): void => {
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(46)} ${detail}`);
};

console.log('the mechanic that must still fire:');
{
  // The body steps onto a button the record never has pressed. Nothing else has
  // changed, so the block it opens is the body's doing and the crate on it is
  // resting on nothing — a contradiction the frozen clock is no protection from.
  const { w } = lived(LIVE_TICKS);
  park(w, BUTTON_X + 40);
  let openedAt = -1;
  let floatingAt = -1;
  for (let f = 0; f < 30; f++) {
    w.stepPlayerFrozen(NO_INPUT);
    if (openedAt < 0 && !w.isSolidPhase(block)) openedAt = f;
    if (floatingAt < 0 && w.floatingBoxIds().length > 0) floatingAt = f;
  }
  report(
    openedAt >= 0 && floatingAt >= 0,
    'body stands in a button while paused',
    `block opened on frame ${openedAt}, crate judged floating on frame ${floatingAt}`,
  );
}

console.log('\nwhat must stay quiet:');
{
  // The same pad, the body nowhere near a button: the record accounts for
  // everything holding the block up, so nothing may come apart.
  const { w } = lived(LIVE_TICKS);
  park(w, 3 * 32);
  let solidEvery = true;
  let floating = 0;
  for (let f = 0; f < 300; f++) {
    w.stepPlayerFrozen(NO_INPUT);
    if (!w.isSolidPhase(block)) solidEvery = false;
    floating += w.floatingBoxIds().length;
  }
  report(
    solidEvery && floating === 0 && crateY(w) === RESTING,
    'body idle on a pad, 300 frozen frames',
    `block solid throughout=${solidEvery}, floating hits=${floating}, crate y=${crateY(w).toFixed(1)}`,
  );
}
{
  // Walking on and off the button while frozen must open and close the block, and
  // leave it closed again — the derive/restore handover must not latch either way.
  const { w } = lived(LIVE_TICKS);
  park(w, BUTTON_X + 40);
  for (let f = 0; f < 10; f++) w.stepPlayerFrozen(NO_INPUT);
  const openedOn = !w.isSolidPhase(block);
  park(w, 3 * 32);
  for (let f = 0; f < 10; f++) w.stepPlayerFrozen(NO_INPUT);
  report(
    openedOn && w.isSolidPhase(block),
    'body steps into the button and back out',
    `open while in=${openedOn}, solid again after=${w.isSolidPhase(block)}`,
  );
}

console.log('\nscrub round trips against the lived record:');
{
  // Backward scrubs place each crate at its recorded state, so they must land on
  // the lived height exactly; forward scrubs re-simulate and are allowed the same
  // drift `fidelity` already tolerates.
  const { w, y } = lived(LIVE_TICKS);
  park(w, 3 * 32);
  let worstBack = 0;
  let worstFwd = 0;
  let floating = 0;
  const targets = [150, 40, 190, 12, 175, 60, 199, 5, 120, 30];
  let prev = w.now;
  for (const t of targets) {
    w.scrubTo(t);
    const gap = Math.abs(crateY(w) - y[t]);
    if (t > prev) worstFwd = Math.max(worstFwd, gap);
    else worstBack = Math.max(worstBack, gap);
    floating += w.floatingBoxIds().length;
    prev = t;
  }
  report(
    worstBack === 0 && worstFwd < 2 && floating === 0,
    'ten scrubs back and forth across the run',
    `worst backward gap ${worstBack.toFixed(2)}px, forward ${worstFwd.toFixed(2)}px, floating hits=${floating}`,
  );
}
{
  // Scrubbing to the same tick twice, by different routes, must agree: the blocks
  // are pinned to that tick's record either way round.
  const a = lived(LIVE_TICKS);
  park(a.w, 3 * 32);
  a.w.scrubTo(180);
  a.w.scrubTo(90);
  const b = lived(LIVE_TICKS);
  park(b.w, 3 * 32);
  b.w.scrubTo(20);
  b.w.scrubTo(90);
  report(
    crateY(a.w) === crateY(b.w) && a.w.isSolidPhase(block) === b.w.isSolidPhase(block),
    'tick 90 reached from above and from below',
    `crate ${crateY(a.w).toFixed(2)} vs ${crateY(b.w).toFixed(2)}, ` +
      `block ${a.w.isSolidPhase(block) ? 'solid' : 'open'} vs ${b.w.isSolidPhase(block) ? 'solid' : 'open'}`,
  );
}
{
  // A scrub that goes nowhere must change nothing.
  const { w } = lived(LIVE_TICKS);
  park(w, 3 * 32);
  w.scrubTo(120);
  const before = { y: crateY(w), solid: w.isSolidPhase(block), now: w.now };
  for (let i = 0; i < 5; i++) w.scrubTo(120);
  report(
    crateY(w) === before.y && w.isSolidPhase(block) === before.solid && w.now === before.now,
    'scrubbing to the tick already stood on',
    `crate ${before.y.toFixed(2)} -> ${crateY(w).toFixed(2)}, block unchanged=${w.isSolidPhase(block) === before.solid}`,
  );
}

console.log(`\n${bad === 0 ? 'all guards hold' : `${bad} guard(s) FAILED`}`);
