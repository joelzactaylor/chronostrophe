/**
 * Does reversing time retrace the path that was lived?
 *
 * "Stand on a fallen stone, reverse time, and ride it back up its own fall" is the
 * core trick, and it only works if a rewinding crate walks back along the worldline
 * the crate actually walked.
 */
import { NO_INPUT } from '../../src/core/world';
import { buildWorld, hold } from './harness';
import { ledgeScenario } from './scenarios';

for (const [label, count, high, ticks] of [
  ['1 crate', 1, 1, 120],
  ['3x1', 3, 1, 220],
  ['3x2', 3, 2, 260],
] as const) {
  const w = buildWorld(ledgeScenario(count, 640, high));
  // Live the run, remembering where every crate actually was on every tick.
  const shown: { x: number; y: number }[][] = [];
  shown[0] = w.boxes.map((b) => ({ x: b.state.x, y: b.state.y }));
  for (let t = 0; t < ticks; t++) {
    w.step(hold({ right: true }));
    shown[w.now] = w.boxes.map((b) => ({ x: b.state.x, y: b.state.y }));
  }

  // Now run time backwards over the same stretch and compare tick for tick.
  w.dir = -1;
  let worst = 0;
  let at = -1;
  for (let t = ticks; t > 0; t--) {
    w.step(NO_INPUT);
    const want = shown[w.now];
    if (!want) continue;
    w.boxes.forEach((b, i) => {
      const d = Math.hypot(b.state.x - want[i].x, b.state.y - want[i].y);
      if (d > worst) {
        worst = d;
        at = w.now;
      }
    });
  }
  console.log(
    `${label.padEnd(8)} worst rewind-vs-lived gap ${worst.toFixed(3).padStart(8)}px` +
      (at < 0 ? '' : ` (at t=${at})`),
  );
}
