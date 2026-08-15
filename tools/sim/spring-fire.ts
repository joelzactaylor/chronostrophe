/**
 * Who makes a spring fire, and whether the world says so.
 *
 * `firedSprings` is all the scene has to draw the squash and play the sound
 * with, so a bounce that leaves it empty is a bounce nothing shows. Four
 * bouncers are checked: the live body, a crate dropped on the plate, a former
 * self retracing a bounce it lived, and the same tick run backwards.
 */
import { SPRING_VEL } from '../../src/core/world';
import { buildWorld, hold } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const FLOOR = GROUND_ROW * 32;
const SPRING_X = 12 * 32;
const rows: string[] = [];
for (let y = 0; y < ROWS; y++) {
  let r = '';
  for (let x = 0; x < COLS; x++) r += y >= GROUND_ROW || x === 0 || x === COLS - 1 ? '#' : '.';
  rows.push(r);
}
const springs = [{ x: SPRING_X, y: FLOOR - 12, w: 32, h: 12 }];

function scene(boxes: Scenario['boxes']): Scenario {
  return { rows, spawn: { x: 6 * 32, y: FLOOR - 26 }, boxes, springs };
}

const dropped = () => scene([{ x: SPRING_X + 2, y: FLOOR - 200, w: 28, h: 28 }]);
const report = (label: string, ticks: number[]): void =>
  console.log(`${label.padEnd(30)} ${ticks.length ? ticks.slice(0, 6).join(', ') : 'never'}`);

// 1. The live body walks onto the plate.
{
  const w = buildWorld(scene([]));
  const fired: number[] = [];
  for (let t = 0; t < 200; t++) {
    w.step(hold({ right: true }));
    if (w.firedSprings.length) fired.push(w.now);
  }
  report('live body, fired on', fired);
}

// 2. A crate is dropped onto the plate: the bounce and the firing are the same tick.
{
  const w = buildWorld(dropped());
  const fired: number[] = [];
  const bounced: number[] = [];
  for (let t = 0; t < 200; t++) {
    const before = w.boxes[0].state.vy;
    w.step(hold({}));
    if (before >= 0 && w.boxes[0].state.vy === SPRING_VEL) bounced.push(w.now);
    if (w.firedSprings.length) fired.push(w.now);
  }
  report('crate, bounced on', bounced);
  report('crate, fired on', fired);
}

// 3. A former self retraces a bounce it lived, and then the world runs backwards
//    through the ticks both it and a crate bounced on.
{
  const w = buildWorld(dropped());
  const lived: number[] = [];
  for (let t = 0; t < 200; t++) {
    w.step(hold({ right: true }));
    if (w.firedSprings.length) lived.push(w.now);
  }
  w.splitRun();
  w.scrubTo(0);
  w.player.x = 64;
  w.player.y = FLOOR - 26;
  w.player.vx = 0;
  w.player.vy = 0;
  const replayed: number[] = [];
  for (let t = 0; t < 200; t++) {
    w.step(hold({}));
    if (w.firedSprings.length) replayed.push(w.now);
  }
  report('body and crate, lived on', lived);
  report('former self, replayed on', replayed);

  w.dir = -1;
  const rewound: number[] = [];
  for (let t = 0; t < 200; t++) {
    w.step(hold({}));
    if (w.firedSprings.length) rewound.push(w.now);
  }
  report('rewinding, fired on', rewound);
}

export {};
