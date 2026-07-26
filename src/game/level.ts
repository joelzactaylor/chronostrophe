import { TileMap } from '../core/physics';
import { BoxSpec } from '../core/world';
import { Rect, TILE, clamp } from '../core/types';

export type DeviceKind = 'chronoporter' | 'anachroverter' | 'chronoclast';

export interface Device {
  kind: DeviceKind;
  /** Pad rect the player has to stand on. */
  rect: Rect;
  label: string;
}

export interface LevelDef {
  name: string;
  /** One-line brief shown while the level starts. */
  brief: string;
  map: TileMap;
  spawn: { x: number; y: number };
  boxes: BoxSpec[];
  devices: Device[];
  hazards: Rect[];
  exit: { x: number; y: number; r: number };
}

const COLS = 44;
const ROWS = 17;

function blankGrid(): string[][] {
  return Array.from({ length: ROWS }, () => new Array<string>(COLS).fill('.'));
}

function fill(grid: string[][], x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = '#';
}

function carve(grid: string[][], x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = '.';
}

function pad(kind: DeviceKind, cx: number, surfaceRow: number, label: string): Device {
  return {
    kind,
    rect: { x: cx * TILE, y: surfaceRow * TILE - 10, w: TILE, h: 10 },
    label,
  };
}

/** Tick at which the monolith of level 1 is let go. */
export const MONOLITH_RELEASE = 150;

/**
 * "Threshold" — a flat sprint for the gate. Two and a half seconds in, a monolith
 * drops across the run and walls it off. The only way through is the chronoporter
 * on the near side: scrub the world back to before the stone fell and walk under
 * the space it will occupy.
 */
function buildThreshold(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, ROWS - 1); // one screen-wide floor, nothing to climb
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall

  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Threshold',
    brief: 'Run for the gate.',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    // Suspended overhead, released mid-sprint: 4x3 tiles of stone, too tall to clear.
    boxes: [
      { x: 30 * TILE, y: 2 * TILE, w: 4 * TILE, h: 3 * TILE, immovable: true, releaseTick: MONOLITH_RELEASE },
    ],
    devices: [pad('chronoporter', 26, 15, 'CHRONOPORTER — drag the slider')],
    hazards: [],
    exit: { x: 40.5 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}

/**
 * "Fallback" — push the crate off the upper shelf, dive after it, then reverse
 * time and ride its rewinding worldline back up to the exit shelf.
 */
function buildFallback(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, ROWS - 1); // floor
  fill(grid, 12, 14, 12, 14); // stairs
  fill(grid, 13, 13, 13, 14);
  fill(grid, 14, 12, 14, 14);
  fill(grid, 15, 11, 23, 11); // shelf A
  fill(grid, 26, 9, 31, 9); // shelf B
  fill(grid, 34, 6, 38, 6); // exit shelf, out of jumping reach from shelf B
  fill(grid, 43, 0, 43, 14); // right wall
  carve(grid, 32, 15, 35, 15); // recess under the chute: the crate lands flush with the floor

  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Fallback',
    brief: 'The crate falls. Ride it back up.',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 29 * TILE, y: 9 * TILE - 28, w: 28, h: 28 }],
    devices: [
      pad('chronoporter', 18, 11, 'CHRONOPORTER — drag the slider'),
      pad('anachroverter', 31, 15, 'ANACHROVERTER — [R] reverse time'),
      pad('chronoclast', 41, 15, 'CHRONOCLAST — history erased'),
    ],
    hazards: [
      { x: 9 * TILE, y: 15 * TILE - 14, w: 2 * TILE, h: 14 },
      { x: 24 * TILE, y: 15 * TILE - 14, w: 2 * TILE, h: 14 },
    ],
    exit: { x: 36.5 * TILE, y: 6 * TILE - 26, r: 22 },
  };
}

export const LEVELS: (() => LevelDef)[] = [buildThreshold, buildFallback];

export function buildLevel(index = 0): LevelDef {
  return LEVELS[clamp(Math.round(index), 0, LEVELS.length - 1)]();
}
