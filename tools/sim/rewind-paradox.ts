/**
 * Every built-in level, lived and then rewound, watching for paradoxes that the
 * rewind itself invents.
 *
 * The forward sweep in `checks` never runs time backwards, so a former self only
 * ever gets judged retracing its own path in the direction it was lived. This one
 * lives a run, stands the body still, and reverses — which is what an
 * anachroverter does, and where a ghost running full speed off a ledge gets
 * judged going the other way.
 *
 *   npm run sim -- rewind-paradox            # every level
 *   npm run sim -- rewind-paradox Ballast    # one, with a tick-by-tick trace
 */
import { NO_INPUT, World, playerRect } from '../../src/core/world';
import type { Input } from '../../src/core/world';
import { LEVELS } from '../../src/game/level';
import { argv, fakeMatterWorld } from './harness';

const LIVE_TICKS = 420;

const PROGRAMS: Record<string, (t: number) => Input> = {
  right: () => ({ ...NO_INPUT, right: true }),
  hop: (t) => ({ ...NO_INPUT, right: true, jump: t % 44 < 8, jumpPressed: t % 44 === 0 }),
  shuffle: (t) => ({ ...NO_INPUT, right: t % 180 < 120, left: t % 180 >= 120 }),
};

function levelWorld(index: number): World {
  const level = LEVELS[index]();
  return new World(
    level.map,
    level.spawn,
    level.boxes,
    level.devices.map((d) => d.rect),
    level.buttons ?? [],
    level.phase ?? [],
    level.springs ?? [],
    fakeMatterWorld,
  );
}

interface Hit {
  tick: number;
  reason: string;
  x: number;
  y: number;
}

/** Lives a run, then rewinds the whole of it with the body standing still. */
function rewindCase(index: number, program: (t: number) => Input, trace = false): Hit[] {
  const w = levelWorld(index);
  for (let t = 0; t < LIVE_TICKS; t++) w.step(program(t));
  w.splitRun();
  w.dir = -1;
  const hits: Hit[] = [];
  for (let t = 0; t < LIVE_TICKS && w.now > 1; t++) {
    w.step(NO_INPUT);
    const p = w.detectParadox();
    if (p) hits.push({ tick: w.now, reason: p.reason, x: p.x, y: p.y });
    if (trace && p) {
      const ghosts = w
        .ghostsAt(w.now)
        .map(({ state }) => {
          const r = playerRect(state);
          return `${r.x.toFixed(1)},${r.y.toFixed(1)} on=${state.groundedOn} vy=${state.vy.toFixed(1)}`;
        })
        .join(' | ');
      const under = w.phase
        .filter((ph) => Math.abs(ph.rect.y - (p.y + 26)) < 2 && Math.abs(ph.rect.x - p.x) < 40)
        .map((ph) => `${ph.rect.x / 32}@g${ph.group}${ph.inverted ? 'i' : ''}=${w.isSolidPhase(ph) ? 'solid' : 'open'}`)
        .join(' ');
      console.log(
        `  t=${w.now} ${p.reason}\n    ghosts: ${ghosts}\n    body ${w.player.x.toFixed(1)},${w.player.y.toFixed(1)} ` +
          `pressed={${[...w.pressed].join(',')}}  blocks under the ghost: ${under}`,
      );
    }
  }
  return hits;
}

const names = LEVELS.map((make) => make().name);
const only = argv[0];
let total = 0;
names.forEach((name, i) => {
  if (only && name.toLowerCase() !== only.toLowerCase()) return;
  for (const [label, program] of Object.entries(PROGRAMS)) {
    const hits = rewindCase(i, program, Boolean(only));
    const floating = hits.filter((h) => h.reason.includes('floating'));
    if (hits.length === 0) continue;
    total += floating.length;
    const first = hits[0];
    console.log(
      `${name.padEnd(16)} ${label.padEnd(8)} ${String(hits.length).padStart(3)} paradox tick(s), ` +
        `${String(floating.length).padStart(3)} floating — first t=${first.tick} ` +
        `at ${first.x.toFixed(0)},${first.y.toFixed(0)}: ${first.reason}`,
    );
  }
});
console.log(`\nfloating paradoxes raised by rewinding: ${total}`);
