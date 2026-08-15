export const TILE = 32;
export const DT = 1 / 60;

/** Number of recorded ticks in a level timeline (60 seconds at 60Hz). */
export const TICKS = 3600;

export const GROUND_NONE = -2;
export const GROUND_TILE = -1;
export const GROUND_GHOST = -3;
/** A time device's volume: solid to objects, open to the live body. */
export const DEVICE_SOLID = -4;

/** A phase block while it is in its solid form. */
export const PHASE_SOLID = -5;

/** A spring block: solid to stand on, and it throws off whatever lands on it. */
export const SPRING_SOLID = -6;

/** No spring threw this body on this tick. */
export const NO_SPRING = -1;

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
  /**
   * How far the body tried to travel sideways this tick, before anything stopped
   * it.
   *
   * `x` is where the body ended up, which is flush against whatever it ran into —
   * so a former self retracing those positions never overlaps the crate it spent
   * the whole run shoving, and cannot tell the tick it made contact from the tick
   * before. What it pushed, it pushed because it *tried* to walk into it; that
   * intent is the part of the shove the resolved position throws away, so it is
   * recorded too.
   */
  intentX: number;
  /**
   * The spring that threw this body on this tick, as an index into the level's
   * springs, or `NO_SPRING`.
   *
   * Firing is an event, and a position is not one: a body thrown on this tick and
   * a body falling past on the next stand in the same place a pixel apart, and a
   * former self retracing either has nothing in its recorded pose to tell them
   * apart. Which spring threw it is therefore recorded like anything else that
   * happened, and a ghost replaying the tick fires the spring again.
   */
  sprung: number;
}

export interface BoxState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The spring that threw this crate on this tick, as for `PlayerState.sprung`. */
  sprung: number;
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
