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
  map: TileMap;
  spawn: { x: number; y: number };
  boxes: BoxSpec[];
  devices: Device[];
  hazards: Rect[];
  hazardsInverted: Rect[];
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
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    // Suspended overhead, released mid-sprint: 4x3 tiles of stone, too tall to clear.
    boxes: [
      { x: 24 * TILE, y: 2 * TILE, w: 4 * TILE, h: 3 * TILE, immovable: true, releaseTick: 150 },
    ],
    devices: [pad('chronoporter', 20, 15, 'CHRONOPORTER')],
    hazards: [],
    hazardsInverted: [],
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
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [monolith(12, 150), monolith(24, 180)],
    devices: [pad('chronoporter', 17, 15, PORTER_LABEL),
    pad('chronoporter', 10, 15, PORTER_LABEL)
    ],
    hazards: [],
    hazardsInverted: [],
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
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    // Clear of the pad on the far side: the pad has to be reachable without
    // shoving the crate first.
    boxes: [{ x: 22 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }, monolith(24, 240)],
    devices: [pad('chronoporter', 15, 15, PORTER_LABEL)],
    hazards: [],
    hazardsInverted: [],
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
    hazardsInverted: [],
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
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [
      // The step: too short to reach the shelf, tall enough to reach the fallen stone.
      { x: 23 * TILE + 4, y: 15 * TILE - 28, w: 28, h: 28 },
      monolith(24, LIFT_RELEASE),
    ],
    devices: [pad('anachroverter', 19, 15, 'ANACHROVERTER')],
    hazards: [],
    hazardsInverted: [],
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
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    // The weight: it starts to the right of the button, so it is shoved back into it.
    boxes: [{ x: 12 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }],
    devices: [],
    buttons: [button(8, 15, 0)],
    // Too tall to jump and the only way to the gate: open only while the button is held.
    phase: phaseBlocks(0, 26, 9, 26, 14),
    hazards: [],
    hazardsInverted: [],
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
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [],
    devices: [pad('chronoporter', 12, 15, 'CHRONOPORTER')],
    buttons: [button(19, 15, 0)],
    phase: [...phaseBlocks(0, 27, 12, 27, 14), ...phaseBlocks(0, 27, 11, 27, 11), ...phaseBlocks(0, 27, 10, 27, 10), ...phaseBlocks(0, 27, 9, 27, 9)],
    hazards: [],
    hazardsInverted: [],
    exit: { x: 39.5 * TILE, y: 13 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildOneTwo(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 6, 13, 36, 13);
  fill(grid, 36, 14, 36, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'One–Two',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [],
    devices: [pad('anachroverter', 7, 15, 'ANACHROVERTER')],
    buttons: [button(10, 15, 0)],
    phase: [...phaseBlocks(0, 9, 11, 13, 11), ...phaseBlocks(0, 14, 11, 18, 11, true), ...phaseBlocks(0, 19, 11, 23, 11), ...phaseBlocks(0, 24, 11, 28, 11, true), ...phaseBlocks(0, 29, 11, 33, 11)],
    hazards: [{ x: 9 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 10 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 11 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 12 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 13 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 14 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 15 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 16 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 27 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 29 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 30 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 31 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 32 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 33 * TILE, y: 12 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [],
    exit: { x: 40.5 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildEscapement(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 16, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 15); // left wall
  fill(grid, 12, 2, 16, 2);
  fill(grid, 22, 2, 43, 2);
  fill(grid, 12, 3, 16, 3);
  fill(grid, 22, 3, 26, 3);
  fill(grid, 43, 3, 43, 3);
  fill(grid, 12, 4, 12, 4);
  fill(grid, 16, 4, 16, 4);
  fill(grid, 22, 4, 22, 4);
  fill(grid, 26, 4, 26, 4);
  fill(grid, 43, 4, 43, 4);
  fill(grid, 12, 5, 12, 5);
  fill(grid, 16, 5, 16, 5);
  fill(grid, 22, 5, 22, 5);
  fill(grid, 26, 5, 26, 5);
  fill(grid, 43, 5, 43, 5);
  fill(grid, 12, 6, 12, 6);
  fill(grid, 16, 6, 16, 6);
  fill(grid, 22, 6, 22, 6);
  fill(grid, 26, 6, 26, 6);
  fill(grid, 43, 6, 43, 6);
  fill(grid, 12, 7, 12, 7);
  fill(grid, 16, 7, 16, 7);
  fill(grid, 22, 7, 22, 7);
  fill(grid, 26, 7, 26, 7);
  fill(grid, 43, 7, 43, 7);
  fill(grid, 12, 8, 12, 8);
  fill(grid, 16, 8, 16, 8);
  fill(grid, 22, 8, 22, 8);
  fill(grid, 26, 8, 26, 8);
  fill(grid, 43, 8, 43, 8);
  fill(grid, 12, 9, 12, 9);
  fill(grid, 16, 9, 16, 9);
  fill(grid, 22, 9, 22, 9);
  fill(grid, 26, 9, 26, 9);
  fill(grid, 43, 9, 43, 9);
  fill(grid, 12, 10, 12, 10);
  fill(grid, 16, 10, 16, 10);
  fill(grid, 22, 10, 22, 10);
  fill(grid, 26, 10, 26, 10);
  fill(grid, 43, 10, 43, 10);
  fill(grid, 12, 11, 12, 11);
  fill(grid, 16, 11, 16, 11);
  fill(grid, 22, 11, 22, 11);
  fill(grid, 26, 11, 26, 11);
  fill(grid, 43, 11, 43, 11);
  fill(grid, 12, 12, 12, 12);
  fill(grid, 16, 12, 16, 12);
  fill(grid, 22, 12, 22, 12);
  fill(grid, 26, 12, 26, 12);
  fill(grid, 33, 12, 36, 12);
  fill(grid, 43, 12, 43, 12);
  fill(grid, 12, 13, 16, 13);
  fill(grid, 22, 13, 26, 13);
  fill(grid, 33, 13, 33, 13);
  fill(grid, 36, 13, 36, 13);
  fill(grid, 43, 13, 43, 13);
  fill(grid, 4, 14, 6, 14);
  fill(grid, 33, 14, 33, 14);
  fill(grid, 36, 14, 36, 14);
  fill(grid, 43, 14, 43, 14);
  fill(grid, 1, 15, 33, 15);
  fill(grid, 36, 15, 43, 15);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Escapement',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 15 * TILE, y: 2 * TILE - 28, w: 28, h: 28 }, monolith(8, 420)],
    devices: [pad('anachroverter', 5, 14, 'ANACHROVERTER'), pad('anachroverter', 13, 2, 'ANACHROVERTER')],
    buttons: [button(14, 15, 1), button(24, 15, 0)],
    phase: [...phaseBlocks(0, 17, 2, 21, 2), ...phaseBlocks(0, 17, 10, 21, 10), ...phaseBlocks(1, 17, 8, 21, 8), ...phaseBlocks(0, 17, 6, 21, 6, true), ...phaseBlocks(1, 17, 4, 21, 4, true), ...phaseBlocks(1, 17, 12, 21, 12, true)],
    hazards: [{ x: 13 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 14 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 15 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 34 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 35 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 30 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 31 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 32 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 33 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 34 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 35 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 36 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 37 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 38 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 39 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 43 * TILE, y: 1 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [],
    exit: { x: 40.5 * TILE, y: 15 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildSkyscraper(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 31, 3, 32, 3);
  fill(grid, 31, 4, 42, 4);
  fill(grid, 14, 5, 18, 5);
  fill(grid, 31, 5, 32, 5);
  fill(grid, 31, 6, 32, 6);
  fill(grid, 13, 7, 18, 7);
  fill(grid, 31, 7, 32, 7);
  fill(grid, 35, 7, 35, 7);
  fill(grid, 40, 7, 40, 7);
  fill(grid, 31, 8, 32, 8);
  fill(grid, 36, 8, 36, 8);
  fill(grid, 39, 8, 39, 8);
  fill(grid, 12, 9, 18, 9);
  fill(grid, 31, 9, 32, 9);
  fill(grid, 37, 9, 37, 9);
  fill(grid, 31, 10, 32, 10);
  fill(grid, 38, 10, 38, 10);
  fill(grid, 11, 11, 18, 11);
  fill(grid, 31, 11, 32, 11);
  fill(grid, 36, 11, 36, 11);
  fill(grid, 39, 11, 39, 11);
  fill(grid, 31, 12, 32, 12);
  fill(grid, 35, 12, 35, 12);
  fill(grid, 40, 12, 40, 12);
  fill(grid, 10, 13, 18, 13);
  fill(grid, 31, 13, 32, 13);
  fill(grid, 31, 14, 32, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Skyscraper',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 16 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }, { x: 16 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 16 * TILE, y: 9 * TILE - 28, w: 28, h: 28 }, { x: 16 * TILE, y: 11 * TILE - 28, w: 28, h: 28 }, { x: 16 * TILE, y: 13 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 6, 15, 'CHRONOPORTER')],
    buttons: [],
    phase: [],
    hazards: [{ x: 33 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 34 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 35 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 36 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 37 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 38 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 39 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [],
    exit: { x: 35.5 * TILE, y: 3 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildStages(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 16, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 15); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 15); // right wall
  fill(grid, 22, 1, 22, 1);
  fill(grid, 5, 2, 9, 2);
  fill(grid, 22, 2, 22, 2);
  fill(grid, 1, 3, 1, 3);
  fill(grid, 5, 3, 9, 3);
  fill(grid, 14, 3, 19, 3);
  fill(grid, 22, 3, 22, 3);
  fill(grid, 5, 4, 5, 4);
  fill(grid, 22, 4, 22, 4);
  fill(grid, 4, 5, 5, 5);
  fill(grid, 22, 5, 22, 5);
  fill(grid, 5, 6, 5, 6);
  fill(grid, 14, 6, 22, 6);
  fill(grid, 1, 7, 1, 7);
  fill(grid, 5, 7, 5, 7);
  fill(grid, 5, 8, 5, 8);
  fill(grid, 4, 9, 9, 9);
  fill(grid, 14, 9, 19, 9);
  fill(grid, 5, 10, 5, 10);
  fill(grid, 1, 11, 1, 11);
  fill(grid, 5, 11, 5, 11);
  fill(grid, 5, 12, 5, 12);
  fill(grid, 4, 13, 9, 13);
  fill(grid, 14, 13, 22, 13);
  fill(grid, 5, 14, 5, 14);
  fill(grid, 9, 14, 9, 14);
  fill(grid, 14, 14, 14, 14);
  fill(grid, 22, 14, 22, 14);
  fill(grid, 1, 15, 5, 15);
  fill(grid, 9, 15, 14, 15);
  fill(grid, 22, 15, 26, 15);
  fill(grid, 31, 15, 42, 15);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Stages',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 8 * TILE, y: 13 * TILE - 28, w: 28, h: 28 }, { x: 29 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, monolith(10, 0)],
    devices: [pad('chronoporter', 8, 2, 'CHRONOPORTER'), pad('anachroverter', 37, 15, 'ANACHROVERTER')],
    buttons: [button(6, 2, 0), button(7, 13, 3), button(18, 13, 2), button(18, 3, 1), button(17, 3, 2)],
    phase: [...phaseBlocks(0, 10, 6, 13, 6, true), ...phaseBlocks(1, 10, 9, 13, 9), ...phaseBlocks(2, 10, 12, 13, 12), ...phaseBlocks(3, 22, 12, 22, 12), ...phaseBlocks(3, 22, 11, 22, 11), ...phaseBlocks(3, 22, 10, 22, 10), ...phaseBlocks(3, 22, 9, 22, 9), ...phaseBlocks(3, 22, 8, 22, 8), ...phaseBlocks(3, 22, 7, 22, 7), ...phaseBlocks(1, 27, 6, 30, 6), ...phaseBlocks(2, 31, 6, 41, 6, true)],
    hazards: [{ x: 22 * TILE, y: 0 * TILE, w: TILE, h: TILE }, { x: 6 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 7 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 8 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 15 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 16 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 15 * TILE, w: TILE, h: TILE }, { x: 14 * TILE, y: 2 * TILE, w: TILE, h: TILE }, { x: 15 * TILE, y: 2 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [],
    exit: { x: 39.5 * TILE, y: 6 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildSpring(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 31, 6, 33, 6);
  fill(grid, 31, 7, 33, 7);
  fill(grid, 31, 8, 33, 8);
  fill(grid, 27, 9, 29, 9);
  fill(grid, 27, 10, 29, 10);
  fill(grid, 27, 11, 29, 11);
  fill(grid, 8, 12, 10, 12);
  fill(grid, 23, 12, 25, 12);
  fill(grid, 8, 13, 10, 13);
  fill(grid, 23, 13, 25, 13);
  fill(grid, 8, 14, 10, 14);
  fill(grid, 23, 14, 25, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Spring',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [],
    devices: [],
    buttons: [],
    phase: [],
    hazards: [{ x: 17 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 13 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 12 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 11 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [spring(6, 15), spring(15, 15), spring(21, 15), spring(24, 12), spring(28, 9), spring(32, 6)],
    exit: { x: 37.5 * TILE, y: 8 * TILE - 26, r: 22 },
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
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 10 * TILE, y: 2 * TILE - 28, w: 28, h: 28 }, monolith(18, 150)],
    devices: [pad('anachroverter', 35, 15, 'ANACHROVERTER'), pad('anachroverter', 14, 2, 'ANACHROVERTER'), pad('chronoporter', 9, 14, 'CHRONOPORTER')],
    buttons: [button(7, 2, 0)],
    phase: [...phaseBlocks(0, 40, 2, 42, 3)],
    hazards: [{ x: 25 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 27 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    exit: { x: 41.5 * TILE, y: 13 * TILE - 26, r: 22 },
  };
}

/**  */
function buildPatience(): LevelDef {
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
    name: 'Patience',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [monolith(10, 300), monolith(18, 480), monolith(26, 480)],
    devices: [pad('anachroverter', 15, 14, 'ANACHROVERTER'), pad('anachroverter', 23, 2, 'ANACHROVERTER'), pad('chronoporter', 34, 15, 'CHRONOPORTER'), pad('anachroverter', 37, 15, 'ANACHROVERTER')],
    buttons: [button(40, 15, 0)],
    phase: [...phaseBlocks(0, 9, 2, 9, 2, true), ...phaseBlocks(0, 8, 2, 8, 2, true), ...phaseBlocks(0, 7, 2, 7, 2, true), ...phaseBlocks(0, 4, 2, 6, 2, true), ...phaseBlocks(0, 1, 2, 3, 2, true), ...phaseBlocks(0, 31, 2, 42, 2, true)],
    hazards: [{ x: 18 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 27 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 29 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 30 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 31 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 32 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 33 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 34 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 35 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 36 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 37 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 38 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 39 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 8 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    exit: { x: 2.5 * TILE, y: 2 * TILE - 26, r: 22 },
  };
}

/**  */
function buildWedge(): LevelDef {
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
    name: 'Wedge',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 33 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }, monolith(16, 660)],
    devices: [pad('chronoporter', 36, 15, 'CHRONOPORTER'), pad('anachroverter', 40, 10, 'ANACHROVERTER'), pad('chronoporter', 7, 2, 'CHRONOPORTER')],
    buttons: [button(39, 15, 0), button(4, 2, 1)],
    phase: [...phaseBlocks(0, 9, 13, 15, 13, true), ...phaseBlocks(1, 23, 8, 23, 8), ...phaseBlocks(1, 23, 7, 23, 7), ...phaseBlocks(1, 24, 6, 26, 6), ...phaseBlocks(1, 27, 7, 27, 8), ...phaseBlocks(0, 12, 2, 15, 2, true), ...phaseBlocks(0, 11, 2, 11, 2, true), ...phaseBlocks(0, 10, 2, 10, 2, true), ...phaseBlocks(0, 9, 2, 9, 2, true)],
    hazards: [],
    hazardsInverted: [],
    exit: { x: 25.5 * TILE, y: 9 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildDrop(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 16, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 15); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 15); // right wall
  fill(grid, 10, 11, 13, 11);
  fill(grid, 22, 11, 31, 11);
  fill(grid, 9, 12, 10, 12);
  fill(grid, 13, 12, 13, 12);
  fill(grid, 29, 12, 31, 12);
  fill(grid, 8, 13, 9, 13);
  fill(grid, 13, 13, 13, 13);
  fill(grid, 30, 13, 31, 13);
  fill(grid, 7, 14, 8, 14);
  fill(grid, 13, 14, 13, 14);
  fill(grid, 1, 15, 13, 15);
  fill(grid, 17, 15, 42, 15);
  fill(grid, 27, 10, 31, 10);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Drop',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 24 * TILE, y: 10 * TILE - 28, w: 28, h: 28 }, { x: 31 * TILE, y: 14 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 11, 11, 'CHRONOPORTER')],
    buttons: [button(5, 15, 0), button(15, 16, 1)],
    phase: [...phaseBlocks(0, 14, 11, 21, 11), ...phaseBlocks(0, 13, 7, 13, 10, true), ...phaseBlocks(1, 22, 7, 22, 10, true), ...phaseBlocks(1, 20, 13, 26, 13, true)],
    hazards: [{ x: 17 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [spring(30, 15)],
    exit: { x: 41.5 * TILE, y: 11 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildBoost(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 14, 9, 18, 9);
  fill(grid, 7, 14, 12, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Boost',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 10 * TILE, y: 14 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 9 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 8 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 3 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 2 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 1 * TILE - 28, w: 28, h: 28 }],
    devices: [],
    buttons: [],
    phase: [],
    hazards: [],
    hazardsInverted: [],
    springs: [spring(13, 15)],
    exit: { x: 39.5 * TILE, y: 4 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildInterception(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 0, 0, 16); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 16); // right wall
  fill(grid, 18, 6, 18, 6);
  fill(grid, 26, 6, 26, 6);
  fill(grid, 12, 7, 26, 7);
  fill(grid, 24, 12, 24, 12);
  fill(grid, 12, 13, 12, 13);
  fill(grid, 1, 15, 7, 15);
  fill(grid, 12, 15, 42, 15);
  fill(grid, 1, 16, 8, 16);
  fill(grid, 10, 16, 42, 16);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Interception',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 22 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 14 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 9 * TILE, y: 13 * TILE - 28, w: 28, h: 28 }, { x: 11 * TILE, y: 13 * TILE - 28, w: 28, h: 28 }, monolith(8, 420)],
    devices: [pad('chronoporter', 16, 7, 'CHRONOPORTER')],
    buttons: [button(20, 7, 0), button(24, 7, 1)],
    phase: [...phaseBlocks(0, 15, 13, 22, 13, true), ...phaseBlocks(0, 8, 7, 11, 7, true), ...phaseBlocks(0, 13, 13, 14, 13, true), ...phaseBlocks(1, 11, 13, 11, 13), ...phaseBlocks(1, 10, 13, 10, 13), ...phaseBlocks(1, 9, 13, 9, 13), ...phaseBlocks(1, 8, 13, 8, 13), ...phaseBlocks(1, 8, 15, 11, 15)],
    hazards: [{ x: 17 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 16 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [spring(14, 15)],
    exit: { x: 40.5 * TILE, y: 10 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildOverhead(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 35, 11, 42, 11);
  fill(grid, 35, 12, 42, 12);
  fill(grid, 35, 13, 36, 13);
  fill(grid, 9, 14, 17, 14);
  fill(grid, 26, 14, 36, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Overhead',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 14 * TILE, y: 14 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 11, 14, 'CHRONOPORTER')],
    buttons: [],
    phase: [],
    hazards: [{ x: 37 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 38 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 39 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [],
    exit: { x: 41.5 * TILE, y: 10 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildPrecognition(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 0, 0, 16); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 13); // right wall
  fill(grid, 13, 7, 17, 7);
  fill(grid, 19, 7, 21, 7);
  fill(grid, 33, 7, 35, 7);
  fill(grid, 38, 7, 42, 7);
  fill(grid, 13, 8, 13, 8);
  fill(grid, 33, 8, 33, 8);
  fill(grid, 11, 9, 11, 9);
  fill(grid, 13, 9, 13, 9);
  fill(grid, 31, 9, 31, 9);
  fill(grid, 33, 9, 33, 9);
  fill(grid, 11, 10, 11, 10);
  fill(grid, 13, 10, 13, 10);
  fill(grid, 31, 10, 31, 10);
  fill(grid, 33, 10, 33, 10);
  fill(grid, 9, 11, 9, 11);
  fill(grid, 11, 11, 11, 11);
  fill(grid, 13, 11, 13, 11);
  fill(grid, 29, 11, 29, 11);
  fill(grid, 31, 11, 31, 11);
  fill(grid, 33, 11, 33, 11);
  fill(grid, 9, 12, 9, 12);
  fill(grid, 11, 12, 11, 12);
  fill(grid, 13, 12, 13, 12);
  fill(grid, 29, 12, 29, 12);
  fill(grid, 31, 12, 31, 12);
  fill(grid, 33, 12, 33, 12);
  fill(grid, 40, 12, 42, 12);
  fill(grid, 7, 13, 7, 13);
  fill(grid, 9, 13, 9, 13);
  fill(grid, 11, 13, 11, 13);
  fill(grid, 13, 13, 13, 13);
  fill(grid, 18, 13, 18, 13);
  fill(grid, 27, 13, 27, 13);
  fill(grid, 29, 13, 29, 13);
  fill(grid, 31, 13, 31, 13);
  fill(grid, 33, 13, 33, 13);
  fill(grid, 40, 13, 42, 13);
  fill(grid, 7, 14, 7, 14);
  fill(grid, 9, 14, 9, 14);
  fill(grid, 11, 14, 11, 14);
  fill(grid, 13, 14, 13, 14);
  fill(grid, 27, 14, 27, 14);
  fill(grid, 29, 14, 29, 14);
  fill(grid, 31, 14, 31, 14);
  fill(grid, 33, 14, 33, 14);
  fill(grid, 40, 14, 40, 14);
  fill(grid, 1, 15, 40, 15);
  fill(grid, 1, 16, 40, 16);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Precognition',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 15 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 15, 15, 'CHRONOPORTER')],
    buttons: [button(24, 15, 0)],
    phase: [...phaseBlocks(0, 18, 7, 18, 7)],
    hazards: [{ x: 8 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 10 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 12 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 30 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 32 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [spring(5, 15), spring(7, 13), spring(9, 11), spring(11, 9)],
    exit: { x: 41.5 * TILE, y: 11 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildCrouch(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 16, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 15); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 15); // right wall
  fill(grid, 17, 0, 42, 0);
  fill(grid, 17, 1, 17, 1);
  fill(grid, 17, 2, 19, 2);
  fill(grid, 14, 3, 14, 3);
  fill(grid, 19, 3, 19, 3);
  fill(grid, 14, 4, 14, 4);
  fill(grid, 19, 4, 19, 4);
  fill(grid, 14, 5, 14, 5);
  fill(grid, 19, 5, 21, 5);
  fill(grid, 12, 6, 12, 6);
  fill(grid, 14, 6, 16, 6);
  fill(grid, 21, 6, 21, 6);
  fill(grid, 12, 7, 12, 7);
  fill(grid, 14, 7, 14, 7);
  fill(grid, 16, 7, 16, 7);
  fill(grid, 21, 7, 21, 7);
  fill(grid, 12, 8, 12, 8);
  fill(grid, 14, 8, 14, 8);
  fill(grid, 16, 8, 16, 8);
  fill(grid, 21, 8, 24, 8);
  fill(grid, 10, 9, 10, 9);
  fill(grid, 12, 9, 12, 9);
  fill(grid, 14, 9, 14, 9);
  fill(grid, 16, 9, 18, 9);
  fill(grid, 24, 9, 24, 9);
  fill(grid, 10, 10, 10, 10);
  fill(grid, 12, 10, 12, 10);
  fill(grid, 14, 10, 14, 10);
  fill(grid, 16, 10, 16, 10);
  fill(grid, 18, 10, 18, 10);
  fill(grid, 24, 10, 38, 10);
  fill(grid, 10, 11, 10, 11);
  fill(grid, 12, 11, 12, 11);
  fill(grid, 14, 11, 14, 11);
  fill(grid, 16, 11, 16, 11);
  fill(grid, 18, 11, 18, 11);
  fill(grid, 8, 12, 8, 12);
  fill(grid, 10, 12, 10, 12);
  fill(grid, 12, 12, 12, 12);
  fill(grid, 14, 12, 14, 12);
  fill(grid, 16, 12, 16, 12);
  fill(grid, 18, 12, 20, 12);
  fill(grid, 8, 13, 8, 13);
  fill(grid, 10, 13, 10, 13);
  fill(grid, 12, 13, 12, 13);
  fill(grid, 14, 13, 14, 13);
  fill(grid, 16, 13, 16, 13);
  fill(grid, 18, 13, 18, 13);
  fill(grid, 20, 13, 20, 13);
  fill(grid, 8, 14, 8, 14);
  fill(grid, 10, 14, 10, 14);
  fill(grid, 12, 14, 12, 14);
  fill(grid, 16, 14, 16, 14);
  fill(grid, 18, 14, 18, 14);
  fill(grid, 20, 14, 20, 14);
  fill(grid, 1, 15, 40, 15);
  fill(grid, 42, 15, 42, 15);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Crouch',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 37 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }, { x: 28 * TILE, y: 10 * TILE - 28, w: 28, h: 28 }, { x: 28 * TILE, y: 9 * TILE - 28, w: 28, h: 28 }, { x: 28 * TILE, y: 8 * TILE - 28, w: 28, h: 28 }, { x: 28 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 28 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 28 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }],
    devices: [],
    buttons: [],
    phase: [],
    hazards: [{ x: 11 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 9 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [{ x: 17 * TILE, y: 3 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 6 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 9 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 6 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 3 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 9 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 9 * TILE, w: TILE, h: TILE }, { x: 15 * TILE, y: 7 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 10 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 13 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 27 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 29 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 30 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 31 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 32 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 33 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 34 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 35 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 36 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 37 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 38 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 27 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 29 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 30 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 31 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 32 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 33 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 34 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 35 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 36 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 37 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 38 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 39 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 1 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 1 * TILE, w: TILE, h: TILE }],
    springs: [spring(6, 15), spring(8, 12), spring(10, 9), spring(12, 6), spring(16, 6), spring(18, 9), spring(20, 12), spring(25, 15), spring(26, 15), spring(27, 15), spring(28, 15), spring(29, 15), spring(41, 16)],
    exit: { x: 21.5 * TILE, y: 3 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildDissolution(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 16, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 15); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 15); // right wall
  fill(grid, 1, 2, 13, 2);
  fill(grid, 18, 2, 42, 2);
  fill(grid, 36, 3, 36, 3);
  fill(grid, 36, 4, 36, 4);
  fill(grid, 36, 5, 36, 5);
  fill(grid, 36, 6, 36, 6);
  fill(grid, 15, 7, 18, 7);
  fill(grid, 24, 7, 24, 7);
  fill(grid, 36, 7, 36, 7);
  fill(grid, 14, 8, 15, 8);
  fill(grid, 24, 8, 24, 8);
  fill(grid, 36, 8, 36, 8);
  fill(grid, 13, 9, 14, 9);
  fill(grid, 24, 9, 24, 9);
  fill(grid, 36, 9, 36, 9);
  fill(grid, 12, 10, 13, 10);
  fill(grid, 24, 10, 24, 10);
  fill(grid, 36, 10, 36, 10);
  fill(grid, 11, 11, 12, 11);
  fill(grid, 24, 11, 33, 11);
  fill(grid, 36, 11, 36, 11);
  fill(grid, 10, 12, 11, 12);
  fill(grid, 24, 12, 24, 12);
  fill(grid, 28, 12, 28, 12);
  fill(grid, 32, 12, 32, 12);
  fill(grid, 36, 12, 36, 12);
  fill(grid, 9, 13, 10, 13);
  fill(grid, 26, 13, 26, 13);
  fill(grid, 30, 13, 30, 13);
  fill(grid, 36, 13, 36, 13);
  fill(grid, 40, 13, 42, 13);
  fill(grid, 8, 14, 9, 14);
  fill(grid, 18, 14, 36, 14);
  fill(grid, 40, 14, 40, 14);
  fill(grid, 1, 15, 9, 15);
  fill(grid, 40, 15, 40, 15);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Dissolution',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 16 * TILE, y: 2 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 26, 11, 'CHRONOPORTER'), pad('chronoclast', 32, 11, 'CHRONOCLAST')],
    buttons: [button(29, 11, 0)],
    phase: [...phaseBlocks(0, 15, 2, 17, 2), ...phaseBlocks(0, 20, 7, 23, 7), ...phaseBlocks(0, 14, 2, 14, 2), ...phaseBlocks(0, 19, 7, 19, 7)],
    hazards: [{ x: 18 * TILE, y: 6 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [{ x: 15 * TILE, y: 9 * TILE, w: TILE, h: TILE }, { x: 16 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 8 * TILE, w: TILE, h: TILE }, { x: 14 * TILE, y: 10 * TILE, w: TILE, h: TILE }, { x: 13 * TILE, y: 11 * TILE, w: TILE, h: TILE }, { x: 12 * TILE, y: 12 * TILE, w: TILE, h: TILE }, { x: 11 * TILE, y: 13 * TILE, w: TILE, h: TILE }, { x: 10 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    springs: [],
    exit: { x: 41.5 * TILE, y: 12 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildDistraction(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, 39, 1, 43, 1);
  fill(grid, 33, 2, 39, 2);
  fill(grid, 43, 2, 43, 2);
  fill(grid, 39, 3, 39, 3);
  fill(grid, 43, 3, 43, 3);
  fill(grid, 39, 4, 39, 4);
  fill(grid, 43, 4, 43, 4);
  fill(grid, 39, 5, 39, 5);
  fill(grid, 43, 5, 43, 5);
  fill(grid, 39, 6, 39, 6);
  fill(grid, 43, 6, 43, 6);
  fill(grid, 16, 7, 18, 7);
  fill(grid, 39, 7, 40, 7);
  fill(grid, 43, 7, 43, 7);
  fill(grid, 39, 8, 39, 8);
  fill(grid, 43, 8, 43, 8);
  fill(grid, 14, 9, 18, 9);
  fill(grid, 30, 9, 30, 9);
  fill(grid, 39, 9, 39, 9);
  fill(grid, 42, 9, 43, 9);
  fill(grid, 30, 10, 32, 10);
  fill(grid, 39, 10, 39, 10);
  fill(grid, 43, 10, 43, 10);
  fill(grid, 12, 11, 18, 11);
  fill(grid, 30, 11, 32, 11);
  fill(grid, 43, 11, 43, 11);
  fill(grid, 27, 12, 29, 12);
  fill(grid, 43, 12, 43, 12);
  fill(grid, 10, 13, 18, 13);
  fill(grid, 27, 13, 27, 13);
  fill(grid, 29, 13, 29, 13);
  fill(grid, 43, 13, 43, 13);
  fill(grid, 27, 14, 29, 14);
  fill(grid, 43, 14, 43, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Distraction',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 17 * TILE, y: 13 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 11 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 9 * TILE - 28, w: 28, h: 28 }, { x: 17 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 6, 15, 'CHRONOPORTER'), pad('chronoclast', 35, 2, 'CHRONOCLAST')],
    buttons: [],
    phase: [],
    hazards: [{ x: 39 * TILE, y: 0 * TILE, w: TILE, h: TILE }, { x: 40 * TILE, y: 0 * TILE, w: TILE, h: TILE }, { x: 41 * TILE, y: 0 * TILE, w: TILE, h: TILE }, { x: 42 * TILE, y: 0 * TILE, w: TILE, h: TILE }, { x: 43 * TILE, y: 0 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [spring(25, 15), spring(28, 12)],
    exit: { x: 41.5 * TILE, y: 5 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildPrecision(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 7, 4, 7, 4);
  fill(grid, 10, 4, 14, 4);
  fill(grid, 25, 4, 42, 4);
  fill(grid, 4, 5, 4, 5);
  fill(grid, 14, 5, 14, 5);
  fill(grid, 25, 5, 25, 5);
  fill(grid, 14, 6, 16, 6);
  fill(grid, 18, 6, 20, 6);
  fill(grid, 22, 6, 22, 6);
  fill(grid, 24, 6, 25, 6);
  fill(grid, 2, 7, 2, 7);
  fill(grid, 14, 7, 14, 7);
  fill(grid, 25, 7, 25, 7);
  fill(grid, 25, 8, 25, 8);
  fill(grid, 3, 9, 3, 9);
  fill(grid, 9, 9, 14, 9);
  fill(grid, 25, 9, 25, 9);
  fill(grid, 6, 10, 6, 10);
  fill(grid, 12, 10, 12, 10);
  fill(grid, 14, 10, 14, 10);
  fill(grid, 25, 10, 25, 10);
  fill(grid, 38, 10, 42, 10);
  fill(grid, 12, 11, 15, 11);
  fill(grid, 17, 11, 18, 11);
  fill(grid, 20, 11, 21, 11);
  fill(grid, 23, 11, 25, 11);
  fill(grid, 38, 11, 38, 11);
  fill(grid, 4, 12, 4, 12);
  fill(grid, 38, 12, 38, 12);
  fill(grid, 1, 13, 1, 13);
  fill(grid, 13, 13, 29, 13);
  fill(grid, 38, 13, 38, 13);
  fill(grid, 38, 14, 38, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Precision',
    map,
    spawn: { x: 3 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 28 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }, { x: 30 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }, { x: 32 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 10, 15, 'CHRONOPORTER'), pad('chronoclast', 1, 15, 'CHRONOCLAST')],
    buttons: [button(12, 4, 0), button(11, 9, 2)],
    phase: [...phaseBlocks(0, 15, 4, 24, 4), ...phaseBlocks(2, 15, 9, 24, 9)],
    hazards: [{ x: 15 * TILE, y: 5 * TILE, w: TILE, h: TILE }, { x: 16 * TILE, y: 5 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 5 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 5 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 5 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 5 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 5 * TILE, w: TILE, h: TILE }, { x: 15 * TILE, y: 10 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 10 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 10 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 10 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 10 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 10 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 10 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [{ x: 15 * TILE, y: 7 * TILE, w: TILE, h: TILE }, { x: 16 * TILE, y: 7 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 7 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 7 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 7 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 7 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 7 * TILE, w: TILE, h: TILE }],
    springs: [spring(14, 13), spring(15, 15)],
    exit: { x: 40.5 * TILE, y: 9 * TILE - 26, r: 22 },
  };
}

/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */
function buildHeap(): LevelDef {
  const grid = blankGrid();
  fill(grid, 0, 15, COLS - 1, 16); // floor
  fill(grid, 0, 0, 0, 14); // left wall
  fill(grid, COLS - 1, 0, COLS - 1, 14); // right wall
  fill(grid, 9, 7, 13, 7);
  fill(grid, 28, 7, 42, 7);
  fill(grid, 6, 10, 6, 10);
  fill(grid, 6, 11, 6, 11);
  fill(grid, 6, 12, 6, 12);
  fill(grid, 8, 12, 8, 12);
  fill(grid, 8, 13, 8, 13);
  fill(grid, 8, 14, 8, 14);
  const map = new TileMap(grid.map((r) => r.join('')));

  return {
    name: 'Heap',
    map,
    spawn: { x: 2 * TILE, y: 15 * TILE - 28 },
    boxes: [{ x: 31 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 32 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 32 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 33 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 33 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 33 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }, { x: 34 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 34 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 34 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }, { x: 34 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }, { x: 35 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 35 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 35 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }, { x: 35 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }, { x: 35 * TILE, y: 3 * TILE - 28, w: 28, h: 28 }, { x: 36 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 36 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 36 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }, { x: 36 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }, { x: 36 * TILE, y: 3 * TILE - 28, w: 28, h: 28 }, { x: 36 * TILE, y: 2 * TILE - 28, w: 28, h: 28 }, { x: 39 * TILE, y: 2 * TILE - 28, w: 28, h: 28 }, { x: 39 * TILE, y: 3 * TILE - 28, w: 28, h: 28 }, { x: 39 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }, { x: 39 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }, { x: 39 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 39 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 40 * TILE, y: 7 * TILE - 28, w: 28, h: 28 }, { x: 40 * TILE, y: 6 * TILE - 28, w: 28, h: 28 }, { x: 40 * TILE, y: 5 * TILE - 28, w: 28, h: 28 }, { x: 40 * TILE, y: 4 * TILE - 28, w: 28, h: 28 }, { x: 40 * TILE, y: 3 * TILE - 28, w: 28, h: 28 }, { x: 40 * TILE, y: 2 * TILE - 28, w: 28, h: 28 }],
    devices: [pad('chronoporter', 11, 7, 'CHRONOPORTER')],
    buttons: [button(11, 15, 3)],
    phase: [...phaseBlocks(3, 27, 7, 27, 7), ...phaseBlocks(3, 26, 7, 26, 7), ...phaseBlocks(3, 25, 7, 25, 7), ...phaseBlocks(3, 24, 7, 24, 7), ...phaseBlocks(3, 23, 7, 23, 7), ...phaseBlocks(3, 22, 7, 22, 7), ...phaseBlocks(3, 21, 7, 21, 7), ...phaseBlocks(3, 20, 7, 20, 7), ...phaseBlocks(3, 19, 7, 19, 7), ...phaseBlocks(3, 18, 7, 18, 7), ...phaseBlocks(3, 17, 7, 17, 7), ...phaseBlocks(3, 16, 7, 16, 7), ...phaseBlocks(3, 15, 7, 15, 7), ...phaseBlocks(3, 14, 7, 14, 7)],
    hazards: [{ x: 13 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 14 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 15 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 16 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 17 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 18 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 19 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 20 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 21 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 22 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 23 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 24 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 25 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 26 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 27 * TILE, y: 14 * TILE, w: TILE, h: TILE }, { x: 28 * TILE, y: 14 * TILE, w: TILE, h: TILE }],
    hazardsInverted: [],
    springs: [spring(7, 15), spring(8, 12), spring(6, 10)],
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
  buildLiveweight,
  buildSpring,
  buildBoost,
  buildOneTwo,
  buildOverhead,
  buildEscapement,
  buildStages,
  buildSwitchback,
  buildPatience,
  buildDrop,
  buildWedge,
  buildInterception,
  buildPrecognition,
  buildSkyscraper,
  buildCrouch,
  buildDissolution,
  buildDistraction,
  buildPrecision,
  buildHeap,
];

export function buildLevel(index = 0): LevelDef {
  return LEVELS[clamp(Math.round(index), 0, LEVELS.length - 1)]();
}
