/** A crate riding a former self's head while that former self jumps. */
import { NO_INPUT } from '../../src/core/world';
import type { Input } from '../../src/core/world';
import { argv, buildWorld, run } from './harness';
import type { Scenario } from './harness';
import { COLS, GROUND_ROW, ROWS } from './scenarios';

const FLOOR = GROUND_ROW * 32;
const STACK = Number(argv[0] ?? 1);
const rows: string[] = [];
for (let y = 0; y < ROWS; y++) {
  let r = '';
  for (let x = 0; x < COLS; x++) r += y >= GROUND_ROW || x === 0 || x === COLS - 1 ? '#' : '.';
  rows.push(r);
}
const scene: Scenario = {
  rows,
  spawn: { x: 6 * 32, y: FLOOR - 26 },
  boxes: Array.from({ length: STACK }, (_, i) => ({ x: 600, y: FLOOR - 200 - i * 28, w: 28, h: 28, releaseTick: 90 })),
};

// Walk right, hopping every 40 ticks — the crate lands on the head at ~t=113.
const hop = (t: number): Input => ({
  ...NO_INPUT,
  right: true,
  jump: t % 40 < 8,
  jumpPressed: t % 40 === 0,
});

const w = buildWorld(scene);
run(w, 260, hop);
w.splitRun();
w.scrubTo(0);
w.player.x = 64;
w.player.y = FLOOR - 26;
w.player.vx = 0;
w.player.vy = 0;

let onHead = 0;
let lostAt = -1;
let everOn = false;
console.log('   t   ghost x,y            crate#0 x,y        on head?');
for (let t = 0; t < 260; t++) {
  w.step(NO_INPUT);
  const g = w.ghostSolidsAt(w.now)[0];
  if (!g) continue;
  const b = w.boxes[0];
  const riding = Math.abs(b.state.y + b.h - g.y) < 6 && b.state.x < g.x + g.w && b.state.x + b.w > g.x;
  if (riding) {
    onHead++;
    everOn = true;
  } else if (everOn && lostAt < 0) {
    lostAt = w.now;
  }
  if (w.now >= 112 && w.now <= 136) {
    console.log(
      `  ${String(w.now).padStart(3)}  ${g.x.toFixed(1).padStart(7)},${g.y.toFixed(1).padStart(7)}   ` +
        `${b.state.x.toFixed(1).padStart(7)},${b.state.y.toFixed(1).padStart(7)}   ${riding ? 'yes' : 'NO'}`,
    );
  }
}
console.log(`\nticks on the head: ${onHead}   first lost at t=${lostAt}`);
