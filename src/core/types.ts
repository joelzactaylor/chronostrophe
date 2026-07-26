export const TILE = 32;
export const DT = 1 / 60;

/** Number of recorded ticks in a level timeline (60 seconds at 60Hz). */
export const TICKS = 3600;

export const GROUND_NONE = -2;
export const GROUND_TILE = -1;
export const GROUND_GHOST = -3;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  ducking: boolean;
  /** GROUND_NONE, GROUND_TILE or the id of the box the body rests on. */
  groundedOn: number;
}

export interface BoxState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** A contiguous segment of recorded player history. */
export interface Run {
  id: number;
  /** Direction global time was flowing while this run was recorded. */
  dir: 1 | -1;
  states: (PlayerState | undefined)[];
  tMin: number;
  tMax: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
