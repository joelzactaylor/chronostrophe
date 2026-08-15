/**
 * Where a ghost stops reproducing the run that recorded it.
 *
 * The premise of the game is that a recorded run replays exactly, so any drift
 * between living a run and watching it back is a bug in itself.
 */
import { NO_INPUT } from '../../src/core/world';
import type { World } from '../../src/core/world';
import { LEVELS } from '../../src/game/level';
import { Frame, argv, buildWorld, fakeMatterWorld, hold, run, snapshot } from './harness';
import { ledgeScenario } from './scenarios';

const TICKS = 460;
const DUMP = argv[0] === 'dump';

function replayOf(make: () => World): { live: Frame[]; replay: Frame[] } {
  const w = make();
  const live = run(w, TICKS, hold({ right: true }));
  const r = make();
  run(r, TICKS, hold({ right: true }));
  r.splitRun();
  r.scrubTo(0);
  const replay: Frame[] = [snapshot(r)];
  for (let i = 0; i < TICKS; i++) {
    r.step(NO_INPUT);
    replay.push(snapshot(r));
  }
  return { live, replay };
}

function report(name: string, make: () => World): void {
  const { live, replay } = replayOf(make);
  let onset = -1;
  let onsetInfo = '';
  let worst = 0;
  for (let t = 0; t < Math.min(live.length, replay.length); t++) {
    for (let b = 0; b < live[t].boxes.length; b++) {
      const d = Math.hypot(live[t].boxes[b].x - replay[t].boxes[b].x, live[t].boxes[b].y - replay[t].boxes[b].y);
      if (d > worst) worst = d;
      if (onset < 0 && d > 0.25) {
        onset = t;
        onsetInfo =
          `crate#${b} live (${live[t].boxes[b].x.toFixed(2)}, ${live[t].boxes[b].y.toFixed(2)}) ` +
          `vs replay (${replay[t].boxes[b].x.toFixed(2)}, ${replay[t].boxes[b].y.toFixed(2)})`;
      }
    }
  }
  console.log(
    `${name.padEnd(14)} worst ${worst.toFixed(2).padStart(8)}px   ` +
      (onset < 0 ? 'never diverges' : `first at t=${onset}: ${onsetInfo}`),
  );
  if (DUMP && onset >= 0) {
    for (let t = Math.max(0, onset - 3); t <= Math.min(onset + 1, live.length - 1); t++) {
      const l = live[t].boxes.map((b) => b.x.toFixed(2).padStart(8)).join('');
      const r = replay[t].boxes.map((b) => b.x.toFixed(2).padStart(8)).join('');
      console.log(`    t=${String(t).padStart(3)} live ${l}\n           replay ${r}`);
    }
  }
}

for (const high of [1, 2, 3]) {
  for (const count of [3, 5]) {
    report(`ledge ${count}x${high}`, () => buildWorld(ledgeScenario(count, 640, high)));
  }
}
let worstLevel = 0;
const noisy: string[] = [];
for (let i = 0; i < LEVELS.length; i++) {
  const l = LEVELS[i]();
  const make = () => new (buildWorld(ledgeScenario(1, 640, 1)).constructor as typeof World)(
    l.map, l.spawn, l.boxes, l.devices.map((d) => d.rect), l.buttons ?? [], l.phase ?? [], l.springs ?? [], fakeMatterWorld,
  );
  const { live, replay } = replayOf(make);
  let worst = 0;
  for (let t = 0; t < Math.min(live.length, replay.length); t++)
    for (let b = 0; b < live[t].boxes.length; b++)
      worst = Math.max(worst, Math.hypot(live[t].boxes[b].x - replay[t].boxes[b].x, live[t].boxes[b].y - replay[t].boxes[b].y));
  if (worst > 0.25) noisy.push(`${l.name} ${worst.toFixed(2)}px`);
  worstLevel = Math.max(worstLevel, worst);
}
console.log(`\nbuilt-in levels: worst replay drift ${worstLevel.toFixed(2)}px`);
console.log(noisy.length ? `  levels that drift: ${noisy.join(', ')}` : '  no level drifts');
