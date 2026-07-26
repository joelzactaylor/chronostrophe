import { TileMap } from '../core/physics';
import { BoxSpec, PLAYER_H, PLAYER_W } from '../core/world';
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

/**
 * A device occupies a volume the player fits inside, one tile wide with the same
 * clearance over the body's head as it has either side of it. Objects cannot enter
 * it, so nothing ever settles in the space the player has to stand in.
 */
const PAD_MARGIN = (TILE - PLAYER_W) / 2;

function pad(kind: DeviceKind, cx: number, surfaceRow: number, label: string): Device {
  const h = PLAYER_H + PAD_MARGIN;
  return {
    kind,
    rect: { x: cx * TILE, y: surfaceRow * TILE - h, w: TILE, h },
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

/** A screen-wide floor with walls at both ends: the shape every chronoporter level uses. */
function corridorGrid(): string[][] {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, ROWS - 1);
  fill(grid, 0, 0, 0, 14);
  fill(grid, COLS - 1, 0, COLS - 1, 14);
  return grid;
}

/** A 4x3 stone suspended overhead, let go at `releaseTick`. */
function monolith(cx: number, releaseTick: number): BoxSpec {
  return { x: cx * TILE, y: 2 * TILE, w: 4 * TILE, h: 3 * TILE, immovable: true, releaseTick };
}

const PORTER_LABEL = 'CHRONOPORTER — drag the slider';

/**
 * "Interval" — two stones on the same run, let go at different times. The near one
 * gives a two-and-a-half second window to sprint past it and reach the pad in the
 * middle; the far one is already down by the time anyone gets there. From the pad
 * the far corridor is close enough to walk through in the past.
 */
function buildInterval(): LevelDef {
  const map = new TileMap(corridorGrid().map((r) => r.join('')));
  return {
    name: 'Interval',
    brief: 'Two stones, two different moments.',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [monolith(12, 150), monolith(24, 180)],
    devices: [pad('chronoporter', 17, 15, PORTER_LABEL)],
    hazards: [],
    exit: { x: 40.5 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}

/**
 * "Ballast" — the gate sits on a shelf three tiles up, out of jumping reach; the
 * crate on the floor is the step that closes the gap. The crate starts on the near
 * side of a stone that comes down four seconds in, and shoving a crate is slow
 * enough that it cannot be walked over from the spawn in time. From the pad beside
 * it, on a clock put back to the start, there is room to push it through.
 */
function buildBallast(): LevelDef {
  const grid = corridorGrid();
  fill(grid, 30, 12, 34, 12); // gate shelf: 3 tiles up, a crate's height short of a jump
  fill(grid, 30, 13, 30, 14); // the shelf's near face, which the crate stops against
  fill(grid, 23, 11, 23, 8); // a wall on the upper left of the monolith
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Ballast',
    brief: 'The crate is the step. Get it through.',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    // Clear of the pad on the far side: the pad has to be reachable without
    // shoving the crate first.
    boxes: [{ x: 21 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }, monolith(24, 240)],
    devices: [pad('chronoporter', 19, 15, PORTER_LABEL)],
    hazards: [],
    exit: { x: 32.5 * TILE, y: 12 * TILE - 26, r: 22 },
  };
}

/**
 * "Cascade" — three stones spread down a long run, each one let go too early to be
 * beaten from where the last one left you. Every pocket between them holds its own
 * pad: reach it, put the world back to the start, and the next corridor is walkable.
 * The gate is up on a shelf at the end, so the last pocket has to be left with the
 * crate rather than ahead of it.
 */
function buildCascade(): LevelDef {
  const grid = corridorGrid();
  fill(grid, 36, 12, 41, 12); // gate shelf above the last pocket
  fill(grid, 36, 13, 36, 14); // its near face: where the crate comes to a stop
  const map = new TileMap(grid.map((r) => r.join('')));
  return {
    name: 'Cascade',
    brief: 'Three stones, then a climb.',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [
      monolith(10, 150),
      monolith(20, 160),
      monolith(30, 120),
      { x: 33 * TILE, y: 15 * TILE - 28, w: 28, h: 28 },
    ],
    devices: [
      pad('chronoporter', 16, 15, PORTER_LABEL),
      pad('chronoporter', 26, 15, PORTER_LABEL),
    ],
    hazards: [],
    exit: { x: 38.5 * TILE, y: 12 * TILE - 26, r: 22 },
  };
}

/**
 * Tick at which the stone of "Lift" is let go. Early: the walk to the pad has to
 * leave enough rewound time to climb onto the resting stone before it lifts, and
 * enough time after it tops out to step off before the world runs out of history.
 */
export const LIFT_RELEASE = 60;

/**
 * "Lift" — the introduction to the anachroverter. The gate is high up beside the
 * place a stone hangs, and there is no way up: the stone has to come down first.
 * Very early on it does, and the crate on the floor is the step onto it. Standing
 * on the pad and reversing time sends the stone back up its own fall — so reverse
 * time first, then climb the crate onto the resting stone and ride it up to the
 * gate as history runs backwards. The stone is let go long before the pad is
 * reached, so rewinding leaves a stretch of it sitting still to climb onto.
 */
function buildLift(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, ROWS - 1); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 28, 2, 33, 2); // gate shelf, level with the stone's hanging place

  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Lift',
    brief: 'The stone falls. Reverse time and ride it back up.',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [
      // The step: too short to reach the shelf, tall enough to reach the fallen stone.
      { x: 23 * TILE + 4, y: 15 * TILE - 28, w: 28, h: 28 },
      monolith(24, LIFT_RELEASE),
    ],
    devices: [pad('anachroverter', 22, 15, 'ANACHROVERTER — [R] reverse time')],
    hazards: [],
    exit: { x: 29.5 * TILE, y: 2 * TILE - 26, r: 22 },
  };
}

export const LEVELS: (() => LevelDef)[] = [
  buildThreshold,
  buildInterval,
  buildBallast,
  buildCascade,
  buildLift,
];

export function buildLevel(index = 0): LevelDef {
  return LEVELS[clamp(Math.round(index), 0, LEVELS.length - 1)]();
}
