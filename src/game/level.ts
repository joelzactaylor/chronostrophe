import { TileMap } from '../core/physics';
import { Rect, TILE } from '../core/types';

export type DeviceKind = 'chronoporter' | 'anachroverter' | 'chronoclast';

export interface Device {
  kind: DeviceKind;
  /** Pad rect the player has to stand on. */
  rect: Rect;
  label: string;
}

export interface LevelDef {
  name: string;
  map: TileMap;
  spawn: { x: number; y: number };
  boxes: { x: number; y: number; w: number; h: number }[];
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

/**
 * "Fallback" — push the crate off the upper shelf, dive after it, then reverse
 * time and ride its rewinding worldline back up to the exit shelf.
 */
export function buildLevel(): LevelDef {
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
