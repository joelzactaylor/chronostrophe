/**
 * A headless sweep of every level: live a scripted run, hand it to history,
 * rewind, and watch the ghost replay it. Prints one line per case, so two
 * revisions of the physics can be diffed against each other exactly.
 *
 *   simrun.sh tools/sim/checks.ts            # every level, every program
 *   simrun.sh tools/sim/checks.ts Ballast    # one level
 */
import { Input, NO_INPUT, World } from '../../src/core/world';
import { LEVELS } from '../../src/game/level';
import { Frame, argv, buildWorld, fakeMatterWorld, findTeleports, snapshot } from './harness';
import { ledgeScenario } from './scenarios';

const TICKS = 420;

/** The input programs a case is driven with. */
const PROGRAMS: Record<string, (t: number) => Input> = {
  right: () => ({ ...NO_INPUT, right: true }),
  left: () => ({ ...NO_INPUT, left: true }),
  hop: (t) => ({ ...NO_INPUT, right: true, jump: t % 44 < 8, jumpPressed: t % 44 === 0 }),
  shuffle: (t) => ({ ...NO_INPUT, right: t % 180 < 120, left: t % 180 >= 120 }),
};

interface Result {
  liveTeleports: number;
  replayTeleports: number;
  liveDetail: string;
  replayDetail: string;
  worstLiveJump: number;
  worstReplayJump: number;
  crushedAt: number;
  paradoxAt: number;
  paradoxReason: string;
  signature: string;
  divergence: number;
  /** Every phase's frames, for the crate-delta summary. */
  frames: Frame[][];
}

/** A short checksum of a whole trajectory, so drift shows up as a changed hash. */
function signature(frames: Frame[]): string {
  let h = 0x811c9dc5;
  for (const f of frames) {
    for (const b of f.boxes) {
      const v = `${b.x.toFixed(3)},${b.y.toFixed(3)}`;
      for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 0x01000193) >>> 0;
    }
    const p = `${f.player.x.toFixed(3)},${f.player.y.toFixed(3)}`;
    for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function worstJump(frames: Frame[]): number {
  let worst = 0;
  for (let i = 1; i < frames.length; i++) {
    for (let b = 0; b < frames[i].boxes.length; b++) {
      worst = Math.max(worst, Math.abs(frames[i].boxes[b].x - frames[i - 1].boxes[b].x));
    }
  }
  return worst;
}

function drive(w: World, ticks: number, program: (t: number) => Input): {
  frames: Frame[];
  crushedAt: number;
  paradoxAt: number;
  paradoxReason: string;
} {
  const frames: Frame[] = [snapshot(w)];
  let crushedAt = -1;
  let paradoxAt = -1;
  let paradoxReason = '';
  for (let t = 0; t < ticks; t++) {
    w.step(program(t));
    frames.push(snapshot(w));
    if (crushedAt < 0 && w.crushed) crushedAt = t;
    if (paradoxAt < 0) {
      const p = w.detectParadox();
      if (p) {
        paradoxAt = t;
        paradoxReason = p.reason;
      }
    }
  }
  return { frames, crushedAt, paradoxAt, paradoxReason };
}

function runCase(make: () => World, program: (t: number) => Input): Result {
  const live = drive(make(), TICKS, program);

  // The same run again, this time handed to history and watched from the start.
  const w = make();
  drive(w, TICKS, program);
  w.splitRun();
  w.scrubTo(0);
  const replay = drive(w, TICKS, () => NO_INPUT);

  let divergence = 0;
  for (let t = 0; t < Math.min(live.frames.length, replay.frames.length); t++) {
    for (let b = 0; b < live.frames[t].boxes.length; b++) {
      divergence = Math.max(
        divergence,
        Math.hypot(
          live.frames[t].boxes[b].x - replay.frames[t].boxes[b].x,
          live.frames[t].boxes[b].y - replay.frames[t].boxes[b].y,
        ),
      );
    }
  }

  const describe = (frames: Frame[], crushedAt: number): string => {
    const tps = findTeleports(frames);
    const body = tps.filter((t) => t.box < 0);
    const crates = tps.filter((t) => t.box >= 0);
    const after = (list: typeof tps) =>
      crushedAt >= 0 && list.every((t) => t.t > crushedAt) ? ' (post-crush)' : '';
    return [
      crates.length ? `crate x${crates.length} max ${Math.max(...crates.map((t) => Math.hypot(t.dx, t.dy))).toFixed(1)}px` : '',
      body.length ? `body x${body.length} max ${Math.max(...body.map((t) => Math.hypot(t.dx, t.dy))).toFixed(1)}px${after(body)}` : '',
    ]
      .filter(Boolean)
      .join(' + ');
  };

  return {
    frames: [live.frames, replay.frames],
    liveDetail: describe(live.frames, live.crushedAt),
    replayDetail: describe(replay.frames, live.crushedAt),
    liveTeleports: findTeleports(live.frames).length,
    replayTeleports: findTeleports(replay.frames).length,
    worstLiveJump: worstJump(live.frames),
    worstReplayJump: worstJump(replay.frames),
    crushedAt: live.crushedAt,
    paradoxAt: live.paradoxAt,
    paradoxReason: live.paradoxReason,
    signature: `${signature(live.frames)}/${signature(replay.frames)}`,
    divergence,
  };
}

function levelWorld(index: number): () => World {
  return () => {
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
  };
}

function report(name: string, program: string, r: Result): void {
  const flags = [
    r.replayTeleports > 0 ? `REPLAY-TELEPORT ${r.replayDetail}` : '',
    r.liveTeleports > 0 ? `LIVE-TELEPORT ${r.liveDetail}` : '',
    r.crushedAt >= 0 ? `crushed@${r.crushedAt}` : '',
    r.paradoxAt >= 0 ? `paradox@${r.paradoxAt}(${r.paradoxReason})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  console.log(
    `${name.padEnd(16)} ${program.padEnd(8)} sig=${r.signature} ` +
      `jump=${r.worstLiveJump.toFixed(2)}/${r.worstReplayJump.toFixed(2)} ` +
      `div=${r.divergence.toFixed(2).padStart(8)} ${flags}`,
  );
}

/** Every position of one case, so two builds of the physics can be diffed. */
function trace(levelName: string, program: string): void {
  const names = LEVELS.map((make) => make().name);
  const i = names.findIndex((n) => n.toLowerCase() === levelName.toLowerCase());
  if (i < 0) throw new Error(`no level ${levelName}`);
  const make = levelWorld(i);
  const live = drive(make(), TICKS, PROGRAMS[program]);
  const w = make();
  drive(w, TICKS, PROGRAMS[program]);
  w.splitRun();
  w.scrubTo(0);
  const replay = drive(w, TICKS, () => NO_INPUT);
  for (const [phase, frames] of [['live', live.frames], ['replay', replay.frames]] as const) {
    for (const f of frames) {
      const cells = f.boxes.map((b) => `${b.x.toFixed(4)} ${b.y.toFixed(4)}`).join(' ');
      console.log(`${phase} ${f.t} ${f.player.x.toFixed(4)} ${f.player.y.toFixed(4)} ${cells}`);
    }
  }
}

/**
 * The headline number: how far a crate moved in a single tick, against how far one
 * can. A crate is shoved at 2.17px a tick, carried at most at walking speed
 * (3.58px), and falls at terminal 15px. Anything past that is relocation.
 */
function crateDeltaSummary(rows: { name: string; frames: Frame[][] }[]): void {
  let worstDx = { v: 0, at: '' };
  let worstDy = { v: 0, at: '' };
  const over = new Set<string>();
  for (const { name, frames } of rows) {
    for (const run of frames) {
      for (let i = 1; i < run.length; i++) {
        for (let b = 0; b < run[i].boxes.length; b++) {
          const dx = Math.abs(run[i].boxes[b].x - run[i - 1].boxes[b].x);
          const dy = Math.abs(run[i].boxes[b].y - run[i - 1].boxes[b].y);
          if (dx > 3.6 || dy > 15.1) over.add(name);
          if (dx > worstDx.v) worstDx = { v: dx, at: `${name} t=${run[i].t} crate#${b}` };
          if (dy > worstDy.v) worstDy = { v: dy, at: `${name} t=${run[i].t} crate#${b}` };
        }
      }
    }
  }
  console.log(`\ncrate deltas: worst sideways ${worstDx.v.toFixed(2)}px (limit 3.60) at ${worstDx.at}`);
  console.log(`              worst falling  ${worstDy.v.toFixed(2)}px (limit 15.10) at ${worstDy.at}`);
  console.log(`              cases with a crate over its limit: ${over.size}${over.size ? ` — ${[...over].join(', ')}` : ''}`);
}

function main(): void {
  if (argv[0] === '--trace') {
    trace(argv[1], argv[2] ?? 'right');
    return;
  }
  const only = argv[0];
  const names = LEVELS.map((make) => make().name);

  const collected: { name: string; frames: Frame[][] }[] = [];
  for (const [program, fn] of Object.entries(PROGRAMS)) {
    for (let i = 0; i < LEVELS.length; i++) {
      if (only && !names[i].toLowerCase().includes(only.toLowerCase())) continue;
      const r = runCase(levelWorld(i), fn);
      report(names[i], program, r);
      collected.push({ name: `${names[i]} ${program}`, frames: r.frames });
    }
  }

  if (!only) {
    // The reported scenario, and the shapes either side of it.
    for (const high of [1, 2, 3]) {
      for (const count of [3, 5, 7]) {
        const r = runCase(() => buildWorld(ledgeScenario(count, 640, high)), PROGRAMS.right);
        report(`ledge ${count}x${high}`, 'right', r);
        collected.push({ name: `ledge ${count}x${high}`, frames: r.frames });
      }
    }
  }
  crateDeltaSummary(collected);
}

main();
