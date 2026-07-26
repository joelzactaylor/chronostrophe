import { GROUND_NONE, GROUND_TILE, Rect, TILE, rectsOverlap } from './types';

export class TileMap {
  readonly cols: number;
  readonly rows: number;
  private readonly solid: Uint8Array;

  constructor(rows: string[]) {
    this.rows = rows.length;
    this.cols = rows[0].length;
    this.solid = new Uint8Array(this.cols * this.rows);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (rows[y][x] === '#') this.solid[y * this.cols + x] = 1;
      }
    }
  }

  isSolid(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return cx < 0 || cx >= this.cols;
    return this.solid[cy * this.cols + cx] === 1;
  }

  get widthPx(): number {
    return this.cols * TILE;
  }

  get heightPx(): number {
    return this.rows * TILE;
  }

  /** Solid tile rects overlapping the given rect. */
  overlapping(r: Rect, out: Rect[] = []): Rect[] {
    out.length = 0;
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 0.001) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 0.001) / TILE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this.isSolid(cx, cy)) out.push({ x: cx * TILE, y: cy * TILE, w: TILE, h: TILE });
      }
    }
    return out;
  }
}

/** Keeps resolved bodies strictly outside each other so grazing contacts do not re-collide. */
const EPS = 0.01;

export interface SolidRect extends Rect {
  /** Box id, or GROUND_TILE for level geometry. */
  id: number;
}

export interface MoveResult {
  hit: boolean;
  /** id of the solid that stopped the motion, if any */
  hitId: number;
}

const scratch: Rect[] = [];

/** Moves rect horizontally, clamping against tiles and solids. Mutates rect.x. */
export function moveX(rect: Rect, dx: number, map: TileMap, solids: SolidRect[]): MoveResult {
  rect.x += dx;
  const res: MoveResult = { hit: false, hitId: GROUND_NONE };
  if (dx === 0) return res;
  const resolve = (other: Rect, id: number) => {
    if (!rectsOverlap(rect, other)) return;
    rect.x = dx > 0 ? other.x - rect.w - EPS : other.x + other.w + EPS;
    res.hit = true;
    res.hitId = id;
  };
  for (const t of map.overlapping(rect, scratch).slice()) resolve(t, GROUND_TILE);
  for (const s of solids) resolve(s, s.id);
  return res;
}

export interface VerticalResult extends MoveResult {
  groundedOn: number;
  ceiling: boolean;
}

/** Moves rect vertically, clamping against tiles and solids. Mutates rect.y. */
export function moveY(rect: Rect, dy: number, map: TileMap, solids: SolidRect[]): VerticalResult {
  rect.y += dy;
  const res: VerticalResult = { hit: false, hitId: GROUND_NONE, groundedOn: GROUND_NONE, ceiling: false };
  const resolve = (other: Rect, id: number) => {
    if (!rectsOverlap(rect, other)) return;
    if (dy > 0) {
      rect.y = other.y - rect.h;
      res.groundedOn = id;
    } else {
      rect.y = other.y + other.h;
      res.ceiling = true;
    }
    res.hit = true;
    res.hitId = id;
  };
  if (dy !== 0) {
    for (const t of map.overlapping(rect, scratch).slice()) resolve(t, GROUND_TILE);
    for (const s of solids) resolve(s, s.id);
  }
  return res;
}

/** True when the rect is resting on a solid surface; returns the supporting id. */
export function supportUnder(rect: Rect, map: TileMap, solids: SolidRect[]): number {
  const probe: Rect = { x: rect.x, y: rect.y + 1, w: rect.w, h: rect.h };
  if (map.overlapping(probe, scratch).length > 0) return GROUND_TILE;
  for (const s of solids) if (rectsOverlap(probe, s)) return s.id;
  return GROUND_NONE;
}
