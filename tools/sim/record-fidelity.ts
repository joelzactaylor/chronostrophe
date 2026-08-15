/**
 * Does a crate's recorded worldline match where the crate actually was?
 *
 * Reversing time retraces `box.record` frame by frame, and scrubbing back reads it
 * too, so any gap between the record and what was on screen is a gap between what
 * you did and what rewinding shows you doing.
 */
import { buildWorld, hold } from './harness';
import { ledgeScenario } from './scenarios';
import type { Box } from '../../src/core/world';

for (const [label, count, high] of [['1 crate', 1, 1], ['3x1', 3, 1], ['3x2', 3, 2]] as const) {
  const w = buildWorld(ledgeScenario(count, 640, high));
  const shown: { x: number; y: number }[][] = [];
  for (let t = 0; t < 300; t++) {
    w.step(hold({ right: true }));
    shown[w.now] = w.boxes.map((b) => ({ x: b.state.x, y: b.state.y }));
  }
  let worst = 0;
  let at = -1;
  let which = -1;
  for (let t = 1; t <= 300; t++) {
    const frame = shown[t];
    if (!frame) continue;
    w.boxes.forEach((b: Box, i) => {
      const rec = b.record[t];
      if (!rec) return;
      const d = Math.hypot(rec.x - frame[i].x, rec.y - frame[i].y);
      if (d > worst) {
        worst = d;
        at = t;
        which = i;
      }
    });
  }
  const rec = w.boxes[which]?.record[at];
  console.log(
    `${label.padEnd(8)} worst record-vs-shown gap ${worst.toFixed(3).padStart(7)}px ` +
      (at < 0 ? '' : `at t=${at} crate#${which}: recorded (${rec!.x.toFixed(2)}, ${rec!.y.toFixed(2)}) but shown (${shown[at][which].x.toFixed(2)}, ${shown[at][which].y.toFixed(2)})`),
  );
}
