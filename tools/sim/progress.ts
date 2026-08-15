/** How far the body actually gets, pushing a row off a ledge. */
import { argv, buildWorld, hold } from './harness';
import { ledgeScenario } from './scenarios';

const TICKS = Number(argv[0] ?? 460);
for (const high of [1, 2, 3]) {
  for (const count of [3, 5, 7]) {
    const w = buildWorld(ledgeScenario(count, 640, high));
    const start = w.player.x;
    let stalled = 0;
    let prev = w.player.x;
    for (let t = 0; t < TICKS; t++) {
      w.step(hold({ right: true }));
      if (w.player.x - prev < 0.05 && t > 40) stalled++;
      prev = w.player.x;
    }
    const offLedge = w.boxes.filter((b) => b.state.y > 15 * 32 + 8).length;
    console.log(
      `${count}x${high}: travelled ${(w.player.x - start).toFixed(0).padStart(4)}px  ` +
        `stalled ${String(stalled).padStart(3)} ticks  crates off the ledge ${offLedge}/${w.boxes.length}`,
    );
  }
}
