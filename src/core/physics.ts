import { GROUND_GHOST, GROUND_NONE, GROUND_TILE, Rect, TILE, rectsOverlap } from './types';

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
  /** Largest distance a single overlap had to be undone by. */
  correction: number;
  /**
   * How deep inside something the rect was left. `depenetrate` frees a body by the
   * shortest way out, so anything still buried afterwards had no way out at all —
   * which is what being crushed looks like now that nothing is flung clear.
   */
  buried?: number;
}

const scratch: Rect[] = [];

/**
 * How much deeper than its own travel a move may be asked to undo.
 *
 * A mover exists to undo the penetration its own motion caused. Anything deeper
 * was already there when the move began — a crate dropping past the body's head
 * catches it by a fraction of a pixel while the two have overlapped left to right
 * for half a second — and treating that as a wall just run into throws the body
 * back across the whole overlap in one tick, which a former self then replays,
 * taking whatever it carries along with it. Overlaps that predate the move are
 * `depenetrate`'s to settle. The slop covers the pixel or so of contact that the
 * epsilons either side of every resolved surface leave behind.
 */
const CONTACT_SLOP = 1;

/** Moves rect horizontally, clamping against tiles and solids. Mutates rect.x. */
export function moveX(rect: Rect, dx: number, map: TileMap, solids: SolidRect[]): MoveResult {
  rect.x += dx;
  const res: MoveResult = { hit: false, hitId: GROUND_NONE, correction: 0 };
  if (dx === 0) return res;
  const resolve = (other: Rect, id: number) => {
    if (!rectsOverlap(rect, other)) return;
    const from = rect.x;
    const to = dx > 0 ? other.x - rect.w - EPS : other.x + other.w + EPS;
    if (Math.abs(to - from) > Math.abs(dx) + CONTACT_SLOP) return;
    rect.x = to;
    res.correction = Math.max(res.correction, Math.abs(rect.x - from));
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

/**
 * Moves rect vertically, clamping against tiles and solids. Mutates rect.y.
 *
 * As in `moveX`, a surface deeper into the rect than the rect has just travelled is
 * not one it has landed on. A crate standing beside a former self, overlapping it
 * by a hair after a shove it could not complete, would otherwise answer the next
 * tick of gravity by taking the ghost's head for the ground and hopping onto it.
 */
export function moveY(rect: Rect, dy: number, map: TileMap, solids: SolidRect[]): VerticalResult {
  rect.y += dy;
  const res: VerticalResult = {
    hit: false,
    hitId: GROUND_NONE,
    correction: 0,
    groundedOn: GROUND_NONE,
    ceiling: false,
  };
  const resolve = (other: Rect, id: number) => {
    if (!rectsOverlap(rect, other)) return;
    if (dy > 0 && !standsOn(rect, other)) return;
    const from = rect.y;
    const to = dy > 0 ? other.y - rect.h : other.y + other.h;
    if (Math.abs(to - from) > Math.abs(dy) + CONTACT_SLOP) return;
    rect.y = to;
    if (dy > 0) res.groundedOn = id;
    else res.ceiling = true;
    res.correction = Math.max(res.correction, Math.abs(rect.y - from));
    res.hit = true;
    res.hitId = id;
  };
  if (dy !== 0) {
    for (const t of map.overlapping(rect, scratch).slice()) resolve(t, GROUND_TILE);
    for (const s of solids) resolve(s, s.id);
  }
  return res;
}

/**
 * How much of a footprint has to be over a surface before it is standing on it.
 * A crate overlapping the last tile of a ledge by a third of a pixel is on its way
 * off, not resting on it.
 */
const SUPPORT_INSET = 1;

/**
 * Whether `rect` has enough of itself over `other` to be held up by it.
 *
 * The mover and the support probe have to agree on this. When they did not, a
 * crate could be grounded by `moveY` on a sliver of ledge while `supportUnder`
 * called it unsupported — so it counted as falling and was left out of every shove
 * as a crate on its way down, yet never actually fell, and the row behind it
 * stopped dead against a crate nothing was allowed to push.
 */
function standsOn(rect: Rect, other: Rect): boolean {
  return Math.min(rect.x + rect.w, other.x + other.w) - Math.max(rect.x, other.x) > SUPPORT_INSET;
}

/** How deep two overlapping rects are into one another: the shorter way out. */
function penetration(a: Rect, b: Rect): number {
  const x = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const y = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return Math.min(x, y);
}

/** How far into the deepest thing it is inside the rect currently is. */
function buriedBy(rect: Rect, map: TileMap, solids: SolidRect[]): number {
  let worst = 0;
  for (const t of map.overlapping(rect, scratch)) worst = Math.max(worst, penetration(rect, t));
  for (const s of solids) {
    if (rectsOverlap(rect, s)) worst = Math.max(worst, penetration(rect, s));
  }
  return worst;
}

/** Whatever the rect is furthest inside, or null when it is clear of everything. */
function deepestOverlap(rect: Rect, map: TileMap, solids: SolidRect[]): SolidRect | null {
  let found: SolidRect | null = null;
  let depth = 0;
  for (const t of map.overlapping(rect, scratch)) {
    const d = penetration(rect, t);
    if (d > depth) {
      depth = d;
      found = { x: t.x, y: t.y, w: t.w, h: t.h, id: GROUND_TILE };
    }
  }
  for (const s of solids) {
    if (!rectsOverlap(rect, s)) continue;
    const d = penetration(rect, s);
    if (d > depth) {
      depth = d;
      found = s;
    }
  }
  return found;
}

/** How many times a body is asked to climb out of what it is inside. */
const DEPENETRATE_PASSES = 4;

/**
 * Pushes a rect out of anything it is already inside, by the shortest way out.
 *
 * An overlap that motion did not cause — a crate shoved into a standing body by a
 * ghost, say — has no direction of travel to undo, and resolving it as part of the
 * next move meant resolving it along that move's axis: gravity, and so always
 * upwards, popping the body onto the crate. So the exit is chosen from the faces
 * of whatever the body is deepest inside, and where the two axes are as short as
 * one another, from whichever of them lands it clear of everything else.
 *
 * Only the *near* face on each axis is an exit. The far face is not a way out but
 * a way through, and a body that takes it comes out the other side of the thing it
 * was inside: that is how a crate wedged against its neighbours would leave in one
 * tick by the width of itself plus the body shoving it, and appear behind whatever
 * was pushing it.
 *
 * `escape` says what to do when the shortest way out is blocked and a longer one is
 * open. An object waits (`shortest`): a crate that climbed its own height into the
 * air every time a neighbour was a hair too close would be worse than a crate that
 * stays put for the tick or two until the neighbour moves. The live body cannot
 * wait (`any`): resting inside a crate is a death by the crushing rule, so it takes
 * whatever way out it can find. Either way both candidates are near faces, so
 * neither can carry anything out the far side of what it is inside.
 */
export function depenetrate(
  rect: Rect,
  map: TileMap,
  solids: SolidRect[],
  escape: 'shortest' | 'any' = 'shortest',
): MoveResult {
  const res: MoveResult = { hit: false, hitId: GROUND_NONE, correction: 0, buried: 0 };
  const start = { x: rect.x, y: rect.y };
  const best = { x: rect.x, y: rect.y, buried: buriedBy(rect, map, solids) };
  if (best.buried <= 0) return res;

  for (let pass = 0; pass < DEPENETRATE_PASSES; pass++) {
    const other = deepestOverlap(rect, map, solids);
    if (!other) break;

    // The two ways out of `other` that do not pass through it: whichever face is
    // nearer on each axis.
    const left = other.x - (rect.x + rect.w) - EPS;
    const right = other.x + other.w - rect.x + EPS;
    const up = other.y - (rect.y + rect.h) - EPS;
    const down = other.y + other.h - rect.y + EPS;
    const exits = [
      Math.abs(left) <= Math.abs(right) ? { dx: left, dy: 0 } : { dx: right, dy: 0 },
      Math.abs(up) <= Math.abs(down) ? { dx: 0, dy: up } : { dx: 0, dy: down },
    ];
    exits.sort((a, b) => Math.abs(a.dx || a.dy) - Math.abs(b.dx || b.dy));

    const clear = (e: { dx: number; dy: number }): boolean => {
      const moved: Rect = { x: rect.x + e.dx, y: rect.y + e.dy, w: rect.w, h: rect.h };
      if (map.overlapping(moved, scratch).length > 0) return false;
      return !solids.some((s) => rectsOverlap(moved, s));
    };
    // Level geometry never moves on, so nothing may be left inside it whatever its
    // `escape` is: a body inside a wall is inside it for the rest of the level.
    //
    // Grazing it is not being inside it, though. A crate settling onto a ledge laps
    // the floor by a hundredth of a pixel every other tick, and treating that as a
    // wall to be got out of at any cost sent it the length of the tile sideways the
    // moment the pixel above it was blocked.
    const permanent =
      other.id !== GROUND_GHOST && other.id < 0 && penetration(rect, other) > SUPPORT_INSET;
    const exit = (escape === 'any' || permanent ? exits.find(clear) : undefined) ?? exits[0];

    rect.x += exit.dx;
    rect.y += exit.dy;
    res.hit = true;
    res.hitId = other.id;

    const buried = buriedBy(rect, map, solids);
    if (buried < best.buried) {
      best.x = rect.x;
      best.y = rect.y;
      best.buried = buried;
    }
    if (buried <= 0) break;
  }

  // Keep the least buried position reached rather than wherever the last pass
  // happened to leave the body: shuffling between two things it cannot escape
  // must not walk it across the room over successive ticks.
  rect.x = best.x;
  rect.y = best.y;
  res.correction = Math.max(Math.abs(rect.x - start.x), Math.abs(rect.y - start.y));
  res.buried = best.buried;
  return res;
}

/**
 * True when the rect is resting on a solid surface; returns the supporting id.
 *
 * The probe is a thin strip directly under the footprint, and what it finds has to
 * pass the same `standsOn` footing test the mover uses. Sinking the whole rect down
 * a pixel instead meant anything it then overlapped held it up — including a body
 * merely alongside it, or the top corner of one a row down and across, so a crate
 * whose own stack had just dropped off a ledge would hang in the air on a neighbour
 * it was never standing on, in the way of everything still being pushed.
 */
export function supportUnder(rect: Rect, map: TileMap, solids: SolidRect[]): number {
  const probe: Rect = { x: rect.x, y: rect.y + rect.h, w: rect.w, h: 1 };
  for (const t of map.overlapping(probe, scratch).slice()) {
    if (standsOn(rect, t)) return GROUND_TILE;
  }
  for (const s of solids) if (rectsOverlap(probe, s) && standsOn(rect, s)) return s.id;
  return GROUND_NONE;
}
