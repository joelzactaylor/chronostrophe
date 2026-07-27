import { TileMap } from '../core/physics';
import { BoxSpec, ButtonSpec, PLAYER_H, PLAYER_W, PhaseSpec } from '../core/world';
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
  /** Push buttons; anything resting in one holds it down. */
  buttons?: ButtonSpec[];
  /** Blocks that swap between solid and passable with a button's group. */
  phase?: PhaseSpec[];
}

export const COLS = 44;
export const ROWS = 17;

export function blankGrid(): string[][] {
  return Array.from({ length: ROWS }, () => new Array<string>(COLS).fill('.'));
}

export function fill(grid: string[][], x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = '#';
}

/**
 * A device occupies a volume the player fits inside, one tile wide with the same
 * clearance over the body's head as it has either side of it. Objects cannot enter
 * it, so nothing ever settles in the space the player has to stand in.
 */
const PAD_MARGIN = (TILE - PLAYER_W) / 2;

/** The volume of a pad standing on `surfaceRow`. */
export function padRect(cx: number, surfaceRow: number): Rect {
  const h = PLAYER_H + PAD_MARGIN;
  return { x: cx * TILE, y: surfaceRow * TILE - h, w: TILE, h };
}

export function pad(kind: DeviceKind, cx: number, surfaceRow: number, label: string): Device {
  return { kind, rect: padRect(cx, surfaceRow), label };
}

/** A button is a shallow plate: it is stood in, not on, and never collides. */
export const BUTTON_H = 8;

/**
 * A push button on the floor of `surfaceRow`, one tile wide unless `tiles` says
 * otherwise. Everything sharing a `group` number works the same blocks.
 */
export function button(cx: number, surfaceRow: number, group = 0, tiles = 1): ButtonSpec {
  return {
    rect: { x: cx * TILE, y: surfaceRow * TILE - BUTTON_H, w: tiles * TILE, h: BUTTON_H },
    group,
  };
}

/**
 * A rectangle of phase blocks, in tile coordinates and inclusive of both corners.
 * They are solid while the group's button is up and passable while it is held
 * down; `inverted` blocks are the other way round, so one button can open one way
 * through and close another.
 */
export function phaseBlocks(
  group: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  inverted = false,
): PhaseSpec[] {
  const out: PhaseSpec[] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      out.push({ rect: { x: x * TILE, y: y * TILE, w: TILE, h: TILE }, group, inverted });
    }
  }
  return out;
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
  fill(grid, 10, 14, 15, 14); // obstacles to practice jumping
  fill(grid, 11, 13, 14, 13);
  fill(grid, 12, 12, 13, 12);
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
    devices: [pad('chronoporter', 26, 15, 'CHRONOPORTER')],
    hazards: [],
    exit: { x: 40.5 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}

/** A screen-wide floor with walls at both ends: the shape every chronoporter level uses. */
export function corridorGrid(): string[][] {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, ROWS - 1);
  fill(grid, 0, 0, 0, 14);
  fill(grid, COLS - 1, 0, COLS - 1, 14);
  return grid;
}

/** A 4x3 stone suspended overhead, let go at `releaseTick`. */
export function monolith(cx: number, releaseTick: number): BoxSpec {
  return { x: cx * TILE, y: 2 * TILE, w: 4 * TILE, h: 3 * TILE, immovable: true, releaseTick };
}

const PORTER_LABEL = 'CHRONOPORTER';

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
    devices: [pad('chronoporter', 17, 15, PORTER_LABEL),
    pad('chronoporter', 10, 15, PORTER_LABEL)
    ],
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
  fill(grid, 21, 2, 23, 13); // a wall on the upper left of the monolith
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Ballast',
    brief: 'The crate is the step. Get it through.',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    // Clear of the pad on the far side: the pad has to be reachable without
    // shoving the crate first.
    boxes: [{ x: 22 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }, monolith(24, 240)],
    devices: [pad('chronoporter', 15, 15, PORTER_LABEL)],
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
  fill(grid, 26, 11, 27, 11); // third platform
  fill(grid, 16, 11, 17, 11); // second platform
  fill(grid, 1, 10, 8, 10); // first platform
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
      { x: 35 * TILE, y: 15 * TILE - 28, w: 28, h: 28 },
    ],
    devices: [
      pad('chronoporter', 16, 15, PORTER_LABEL),
      pad('chronoporter', 26, 15, PORTER_LABEL),
      pad('chronoporter', 8, 15, PORTER_LABEL),
    ],
    hazards: [],
    exit: { x: 4 * TILE, y: 9 * TILE - 26, r: 22 },
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
    devices: [pad('anachroverter', 19, 15, 'ANACHROVERTER')],
    hazards: [],
    exit: { x: 29.5 * TILE, y: 2 * TILE - 26, r: 22 },
  };
}

/**
 * "Deadweight" — the introduction to buttons. The gate is behind an orange wall
 * that stands while the button on the floor is up, and the button is far enough
 * from the wall that standing in it yourself gets you nothing: the way through is
 * open only while you are not the thing holding it open. The crate is the answer —
 * shove it into the button and leave it there — and a former self left standing in
 * the button on a rewound clock does the same job.
 */
function buildDeadweight(): LevelDef {
  const grid = corridorGrid();
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Deadweight',
    brief: 'Something has to stay on the button.',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    // The weight: it starts to the right of the button, so it is shoved back into it.
    boxes: [{ x: 12 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 18, 15, PORTER_LABEL)],
    buttons: [button(8, 15, 0)],
    // Too tall to jump and the only way to the gate: open only while the button is held.
    phase: phaseBlocks(0, 26, 9, 26, 14),
    hazards: [],
    exit: { x: 40.5 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}

export const LEVELS: (() => LevelDef)[] = [
  buildThreshold,
  buildInterval,
  buildBallast,
  buildCascade,
  buildLift,
  buildDeadweight,
];

export function buildLevel(index = 0): LevelDef {
  return LEVELS[clamp(Math.round(index), 0, LEVELS.length - 1)]();
}
