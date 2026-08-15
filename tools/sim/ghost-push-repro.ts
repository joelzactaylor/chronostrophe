/**
 * The reported bug: a former self shoving a row of two-high crate stacks off a
 * ledge sends the crate right in front of it to the far side of its own body the
 * moment the far end of the chain starts to fall.
 *
 * Live the run, hand it to history, rewind to the start, and watch the replay.
 */
import { Frame, argv, buildWorld, findTeleports, hold, printFrame, run, snapshot } from './harness';
import type { Scenario } from './harness';
import { NO_INPUT, World } from '../../src/core/world';
import { SHELF_ROW, ledgeScenario } from './scenarios';

/** Lives a run holding right, hands it to history, and replays it as a ghost. */
export function liveThenReplay(
  ticks: number,
  s: Scenario = ledgeScenario(),
): { live: Frame[]; replay: Frame[]; world: World } {
  const w = buildWorld(s);
  const live = run(w, ticks, hold({ right: true }));

  // Hand the run to history and rewind to the start, as a chronoporter does.
  w.splitRun();
  w.scrubTo(0);
  // The body itself waits out of the way on the far left, where nothing it does
  // can touch the crates: only the recorded run should be acting on them.
  w.player.x = 32;
  w.player.y = SHELF_ROW * 32 - 26;
  w.player.vx = 0;
  w.player.vy = 0;

  const replay: Frame[] = [snapshot(w)];
  for (let i = 0; i < ticks; i++) {
    w.step(NO_INPUT);
    replay.push(snapshot(w));
  }
  return { live, replay, world: w };
}

function main(): void {
  const TICKS = Number(argv[0] ?? 600);
  const COUNT = Number(argv[1] ?? 5);
  const HIGH = Number(argv[2] ?? 2);
  const { live, replay } = liveThenReplay(TICKS, ledgeScenario(COUNT, 640, HIGH));

  const liveTeleports = findTeleports(live);
  const replayTeleports = findTeleports(replay);

  console.log(`crates: ${live[0].boxes.length}   ticks: ${TICKS}   stacks ${COUNT} x ${HIGH} high`);
  console.log(`live run     teleports: ${liveTeleports.length}`);
  console.log(`ghost replay teleports: ${replayTeleports.length}`);

  for (const tp of [...liveTeleports.slice(0, 6), ...replayTeleports.slice(0, 12)]) {
    console.log(
      `  t=${tp.t} crate #${tp.box} moved ${tp.dx.toFixed(2)},${tp.dy.toFixed(2)} ` +
        `from (${tp.from.x.toFixed(2)}, ${tp.from.y.toFixed(2)}) to (${tp.to.x.toFixed(2)}, ${tp.to.y.toFixed(2)})`,
    );
  }

  if (replayTeleports.length > 0) {
    const first = replayTeleports[0];
    console.log(`\n--- replay frames around the first teleport (t=${first.t}) ---`);
    for (let t = Math.max(0, first.t - 4); t <= Math.min(replay.length - 1, first.t + 2); t++) {
      printFrame(replay[t]);
    }
  }

  // The other way back through the same stretch: scrubbing the slider forward on
  // a chronoporter, which re-simulates the objects tick by tick with the run
  // still live and shown as a ghost.
  const scrubbed = buildWorld(ledgeScenario(COUNT, 640, HIGH));
  run(scrubbed, TICKS, hold({ right: true }));
  scrubbed.paused = true;
  scrubbed.scrubTo(0);
  const scrubFrames: Frame[] = [snapshot(scrubbed)];
  for (let t = 1; t <= TICKS; t++) {
    scrubbed.scrubTo(t);
    scrubFrames.push(snapshot(scrubbed));
  }
  const scrubTeleports = findTeleports(scrubFrames);
  console.log(`scrub forward teleports: ${scrubTeleports.length}`);
  for (const tp of scrubTeleports.slice(0, 6)) {
    console.log(
      `  t=${tp.t} ${tp.box < 0 ? 'body' : `crate #${tp.box}`} moved ${tp.dx.toFixed(2)},${tp.dy.toFixed(2)} ` +
        `from (${tp.from.x.toFixed(2)}, ${tp.from.y.toFixed(2)}) to (${tp.to.x.toFixed(2)}, ${tp.to.y.toFixed(2)})`,
    );
  }

  // Divergence between what the run did and what its ghost reproduces.
  let worst = { t: -1, box: -1, d: 0 };
  for (let t = 0; t < Math.min(live.length, replay.length); t++) {
    for (let b = 0; b < live[t].boxes.length; b++) {
      const d = Math.hypot(live[t].boxes[b].x - replay[t].boxes[b].x, live[t].boxes[b].y - replay[t].boxes[b].y);
      if (d > worst.d) worst = { t, box: b, d };
    }
  }
  console.log(`\nworst live-vs-replay divergence: ${worst.d.toFixed(2)}px (crate #${worst.box} at t=${worst.t})`);
}

main();

