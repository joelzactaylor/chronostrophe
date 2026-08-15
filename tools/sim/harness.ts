/**
 * A headless driver for `World`, so timeline behaviour can be checked without a
 * browser: build a level out of tile rows, live a run, hand it to history, and
 * watch the ghost replay it.
 */
import { TileMap } from '../../src/core/physics';
import { TILE } from '../../src/core/types';
import type { Rect } from '../../src/core/types';
import { BoxSpec, Input, NO_INPUT, World, playerRect } from '../../src/core/world';

/** A Phaser Matter world as far as `World` is concerned. */
export const fakeMatterWorld = { engine: { world: {} } } as never;

declare const process: { argv: string[] } | undefined;

/** Command line arguments after the entry name, for the checks that take them. */
export const argv: string[] = typeof process === 'undefined' ? [] : process.argv.slice(2);

export interface Scenario {
  rows: string[];
  spawn: { x: number; y: number };
  boxes: BoxSpec[];
  devices?: Rect[];
}

export function crate(cx: number, row: number): BoxSpec {
  return { x: cx * TILE, y: row * TILE - 28, w: 28, h: 28 };
}

/** A crate at an explicit pixel position, for stacks that are not tile aligned. */
export function crateAt(x: number, y: number): BoxSpec {
  return { x, y, w: 28, h: 28 };
}

export function buildWorld(s: Scenario): World {
  return new World(
    new TileMap(s.rows),
    s.spawn,
    s.boxes,
    s.devices ?? [],
    [],
    [],
    [],
    fakeMatterWorld,
  );
}

export interface Frame {
  t: number;
  player: { x: number; y: number };
  boxes: { x: number; y: number; vx: number; vy: number }[];
  ghosts: { x: number; y: number }[];
}

export function snapshot(w: World): Frame {
  return {
    t: w.now,
    player: { x: w.player.x, y: w.player.y },
    boxes: w.boxes.map((b) => ({ x: b.state.x, y: b.state.y, vx: b.state.vx, vy: b.state.vy })),
    ghosts: w.ghostsAt(w.now).map(({ state }) => {
      const r = playerRect(state);
      return { x: r.x, y: r.y };
    }),
  };
}

export function hold(input: Partial<Input>): Input {
  return { ...NO_INPUT, ...input };
}

/** Runs `ticks` steps, returning a frame per tick (the state after each step). */
export function run(w: World, ticks: number, input: Input | ((t: number) => Input)): Frame[] {
  const frames: Frame[] = [snapshot(w)];
  for (let i = 0; i < ticks; i++) {
    w.step(typeof input === 'function' ? input(i) : input);
    frames.push(snapshot(w));
  }
  return frames;
}

export interface Teleport {
  t: number;
  box: number;
  dx: number;
  dy: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * A jump no per-tick motion can account for.
 *
 * A crate is shoved at BOX_PUSH_SPEED (2.17px a tick), is carried at most at
 * walking speed (MOVE_SPEED, 3.58px), and falls at terminal 900px/s (15px). The
 * body walks at 3.58px and falls at 1200px/s (20px). These are the real ceilings,
 * not a margin around them: anything past one is relocation rather than movement.
 */
export function findTeleports(frames: Frame[], maxDx = 3.6, maxDy = 15.1): Teleport[] {
  const out: Teleport[] = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    // The body walks at MOVE_SPEED/60 = 3.58px and falls at 1200/60 = 20px.
    const pdx = curr.player.x - prev.player.x;
    const pdy = curr.player.y - prev.player.y;
    if (Math.abs(pdx) > 3.6 || Math.abs(pdy) > 20.1) {
      out.push({ t: curr.t, box: -1, dx: pdx, dy: pdy, from: prev.player, to: curr.player });
    }
    for (let b = 0; b < curr.boxes.length; b++) {
      const dx = curr.boxes[b].x - prev.boxes[b].x;
      const dy = curr.boxes[b].y - prev.boxes[b].y;
      if (Math.abs(dx) > maxDx || Math.abs(dy) > maxDy) {
        out.push({ t: curr.t, box: b, dx, dy, from: prev.boxes[b], to: curr.boxes[b] });
      }
    }
  }
  return out;
}

export function fmt(n: number): string {
  return n.toFixed(2).padStart(9);
}

export function printFrame(f: Frame, boxIds?: number[]): void {
  const ids = boxIds ?? f.boxes.map((_, i) => i);
  const boxes = ids.map((i) => `#${i} ${fmt(f.boxes[i].x)},${fmt(f.boxes[i].y)}`).join('  ');
  const ghosts = f.ghosts.map((g) => `${fmt(g.x)},${fmt(g.y)}`).join(' | ');
  console.log(`t=${String(f.t).padStart(4)} P ${fmt(f.player.x)},${fmt(f.player.y)}  G[${ghosts}]  ${boxes}`);
}
