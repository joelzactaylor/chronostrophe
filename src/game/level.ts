import { TileMap } from '../core/physics';
import { BoxSpec, ButtonSpec, PLAYER_H, PLAYER_W, PhaseSpec, SPRING_H } from '../core/world';
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
  /** Spring blocks: stand on one and it throws you about 120px up. */
  springs?: Rect[];
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

/** A spring block standing on the floor of `surfaceRow`, one tile wide. */
export function spring(cx: number, surfaceRow: number, tiles = 1): Rect {
  return { x: cx * TILE, y: surfaceRow * TILE - SPRING_H, w: tiles * TILE, h: SPRING_H };
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
 * shove it into the button and leave it there.
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
    devices: [],
    buttons: [button(8, 15, 0)],
    // Too tall to jump and the only way to the gate: open only while the button is held.
    phase: phaseBlocks(0, 26, 9, 26, 14),
    hazards: [],
    exit: { x: 40.5 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}

/** "Liveweight" — the same as the last level, except the player must use their ghost to press the button. */
function buildLiveweight(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Liveweight',
    brief: '',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [],
    devices: [pad('chronoporter', 12, 15, 'CHRONOPORTER')],
    buttons: [button(19, 15, 0)],
    phase: [...phaseBlocks(0, 27, 12, 27, 14), ...phaseBlocks(0, 27, 11, 27, 11), ...phaseBlocks(0, 27, 10, 27, 10), ...phaseBlocks(0, 27, 9, 27, 9)],
    hazards: [],
    exit: { x: 39.5 * TILE, y: 13 * TILE - 26, r: 22 },
  };
}

/**  */
function buildSwitchback(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 1, 2, 17, 2);
  fill(grid, 22, 2, 39, 2);
  fill(grid, 1, 3, 17, 3);
  fill(grid, 22, 3, 39, 3);
  fill(grid, 38, 4, 39, 4);
  fill(grid, 38, 5, 39, 5);
  fill(grid, 38, 6, 39, 6);
  fill(grid, 38, 7, 39, 7);
  fill(grid, 38, 8, 39, 8);
  fill(grid, 38, 9, 39, 9);
  fill(grid, 38, 10, 39, 10);
  fill(grid, 38, 11, 39, 11);
  fill(grid, 38, 12, 39, 12);
  fill(grid, 24, 13, 29, 13);
  fill(grid, 38, 13, 39, 13);
  fill(grid, 6, 14, 11, 14);
  fill(grid, 24, 14, 24, 14);
  fill(grid, 29, 14, 29, 14);
  fill(grid, 38, 14, 39, 14);
  fill(grid, 1, 0, 42, 0);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Switchback',
    brief: '',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 10 * TILE, y: 2 * TILE - 28, w: 28, h: 28 }, monolith(18, 150)],
    devices: [pad('anachroverter', 35, 15, 'ANACHROVERTER'), pad('anachroverter', 14, 2, 'ANACHROVERTER'), pad('chronoporter', 9, 14, 'CHRONOPORTER')],
    buttons: [button(7, 2, 0)],
    phase: [...phaseBlocks(0, 40, 2, 42, 3)],
    hazards: [{ x: 25 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 27 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    exit: { x: 41.5 * TILE, y: 13 * TILE - 26, r: 22 },
  };
}

/**  */
function buildServant(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 22, 2, 25, 2);
  fill(grid, 30, 2, 30, 2);
  fill(grid, 22, 3, 25, 3);
  fill(grid, 30, 3, 30, 3);
  fill(grid, 22, 4, 25, 4);
  fill(grid, 30, 4, 30, 4);
  fill(grid, 22, 5, 25, 5);
  fill(grid, 30, 5, 30, 5);
  fill(grid, 22, 6, 25, 6);
  fill(grid, 30, 6, 30, 6);
  fill(grid, 22, 7, 25, 7);
  fill(grid, 30, 7, 30, 7);
  fill(grid, 22, 8, 25, 8);
  fill(grid, 30, 8, 30, 8);
  fill(grid, 22, 9, 25, 9);
  fill(grid, 30, 9, 42, 9);
  fill(grid, 14, 14, 16, 14);
  fill(grid, 31, 14, 32, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Servant',
    brief: '',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [monolith(10, 300), monolith(18, 480), monolith(26, 480)],
    devices: [pad('anachroverter', 15, 14, 'ANACHROVERTER'), pad('anachroverter', 23, 2, 'ANACHROVERTER'), pad('chronoporter', 34, 15, 'CHRONOPORTER'), pad('anachroverter', 37, 15, 'ANACHROVERTER')],
    buttons: [button(40, 15, 0)],
    phase: [...phaseBlocks(0, 9, 2, 9, 2, true), ...phaseBlocks(0, 8, 2, 8, 2, true), ...phaseBlocks(0, 7, 2, 7, 2, true), ...phaseBlocks(0, 4, 2, 6, 2, true), ...phaseBlocks(0, 1, 2, 3, 2, true), ...phaseBlocks(0, 31, 2, 42, 2, true)],
    hazards: [{ x: 18 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 27 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 29 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 30 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 31 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 32 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 33 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 34 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 35 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 36 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 37 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 38 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 39 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 8 * TILE, w: TILE, h: TILE }],
    exit: { x: 2.5 * TILE, y: 2 * TILE - 26, r: 22 },
  };
}

/**  */
function buildGroups(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 3, 2, 8, 2);
  fill(grid, 20, 9, 38, 9);
  fill(grid, 42, 9, 42, 9);
  fill(grid, 38, 10, 42, 10);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Groups',
    brief: '',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 33 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }, monolith(16, 660)],
    devices: [pad('chronoporter', 36, 15, 'CHRONOPORTER'), pad('anachroverter', 40, 10, 'ANACHROVERTER'), pad('chronoporter', 7, 2, 'CHRONOPORTER')],
    buttons: [button(39, 15, 0), button(4, 2, 1)],
    phase: [...phaseBlocks(0, 9, 13, 15, 13, true), ...phaseBlocks(1, 23, 8, 23, 8), ...phaseBlocks(1, 23, 7, 23, 7), ...phaseBlocks(1, 24, 6, 26, 6), ...phaseBlocks(1, 27, 7, 27, 8), ...phaseBlocks(0, 12, 2, 15, 2, true), ...phaseBlocks(0, 11, 2, 11, 2, true), ...phaseBlocks(0, 10, 2, 10, 2, true), ...phaseBlocks(0, 9, 2, 9, 2, true)],
    hazards: [],
    exit: { x: 25.5 * TILE, y: 9 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildInversion(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 16, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 15); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 15); // right wall
  fill(grid, 10, 11, 13, 11);
  fill(grid, 22, 11, 29, 11);
  fill(grid, 9, 12, 10, 12);
  fill(grid, 13, 12, 13, 12);
  fill(grid, 29, 12, 30, 12);
  fill(grid, 8, 13, 9, 13);
  fill(grid, 13, 13, 13, 13);
  fill(grid, 30, 13, 31, 13);
  fill(grid, 7, 14, 8, 14);
  fill(grid, 13, 14, 13, 14);
  fill(grid, 31, 14, 32, 14);
  fill(grid, 1, 15, 13, 15);
  fill(grid, 17, 15, 42, 15);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Inversion',
    brief: '',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 24 * TILE, y: 10 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 11, 11, 'CHRONOPORTER'), pad('chronoporter', 28, 11, 'CHRONOPORTER')],
    buttons: [button(36, 15, 1), button(5, 15, 0), button(15, 16, 0)],
    phase: [...phaseBlocks(0, 14, 11, 21, 11), ...phaseBlocks(0, 13, 10, 13, 10, true), ...phaseBlocks(0, 13, 9, 13, 9, true), ...phaseBlocks(0, 13, 8, 13, 8, true), ...phaseBlocks(0, 13, 7, 13, 7, true), ...phaseBlocks(0, 13, 6, 13, 6, true), ...phaseBlocks(0, 13, 5, 13, 5, true), ...phaseBlocks(0, 13, 4, 13, 4, true), ...phaseBlocks(0, 13, 3, 13, 3, true), ...phaseBlocks(0, 13, 2, 13, 2, true), ...phaseBlocks(0, 13, 1, 13, 1, true), ...phaseBlocks(0, 13, 0, 13, 0, true), ...phaseBlocks(0, 26, 10, 26, 10, true), ...phaseBlocks(0, 26, 9, 26, 9, true), ...phaseBlocks(0, 26, 8, 26, 8, true), ...phaseBlocks(0, 26, 7, 26, 7, true), ...phaseBlocks(0, 26, 6, 26, 6, true), ...phaseBlocks(0, 26, 5, 26, 5, true), ...phaseBlocks(0, 26, 4, 26, 4, true), ...phaseBlocks(0, 26, 3, 26, 3, true), ...phaseBlocks(0, 26, 2, 26, 2, true), ...phaseBlocks(0, 26, 1, 26, 1, true), ...phaseBlocks(0, 26, 0, 26, 0, true), ...phaseBlocks(1, 17, 13, 26, 13, true)],
    hazards: [{ x: 14 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 16 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 15 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    springs: [],
    exit: { x: 28.5 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}

export const LEVELS: (() => LevelDef)[] = [
  buildThreshold,
  buildInterval,
  buildBallast,
  buildCascade,
  buildLift,
  buildDeadweight,
  buildLiveweight,
  buildSwitchback,
  buildServant,
  buildGroups,
  buildInversion,
];

export function buildLevel(index = 0): LevelDef {
  return LEVELS[clamp(Math.round(index), 0, LEVELS.length - 1)]();
}
