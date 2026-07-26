import { SolidRect, TileMap, depenetrate, moveX, moveY, supportUnder } from './physics';
import {
  BoxState,
  DEVICE_SOLID,
  DT,
  GROUND_GHOST,
  GROUND_NONE,
  GROUND_TILE,
  PlayerState,
  Rect,
  Run,
  TICKS,
  clamp,
  rectsOverlap,
} from './types';

export const GRAVITY = 1900;
export const MOVE_SPEED = 215;
export const AIR_ACCEL = 1500;
export const GROUND_ACCEL = 2600;
export const FRICTION = 2400;
export const JUMP_VEL = -580;
export const JUMP_CUT = 0.42;
export const COYOTE_TICKS = 6;
export const BUFFER_TICKS = 7;
export const PLAYER_W = 20;
export const PLAYER_H = 28;
export const PLAYER_DUCK_H = 16;
export const BOX_PUSH_SPEED = 130;

/** Separation kept between a shoved object and the body that shoved it. */
const EPS = 0.02;

/**
 * How far below a recorded body its support may sit and still hold it up. A crate
 * carrying a ghost down a fall trails it by up to a tick of travel, so the probe is
 * deliberately generous: only a body with nothing beneath it is standing on nothing.
 */
const GHOST_SUPPORT_PROBE = 24;

export interface Input {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  jumpPressed: boolean;
}

export const NO_INPUT: Input = { left: false, right: false, down: false, jump: false, jumpPressed: false };

/** An object as a level describes it. */
export interface BoxSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Too heavy to shove: the player is stopped by it instead. */
  immovable?: boolean;
  /** Held in place until this tick of the timeline, then let go. */
  releaseTick?: number;
}

export interface Box {
  id: number;
  w: number;
  h: number;
  state: BoxState;
  initial: BoxState;
  record: BoxState[];
  recordedMax: number;
  immovable: boolean;
  releaseTick: number;
}

export interface Paradox {
  run: Run;
  tick: number;
  reason: string;
  x: number;
  y: number;
}

export function playerRect(s: { x: number; y: number; ducking: boolean }): Rect {
  return { x: s.x, y: s.y, w: PLAYER_W, h: s.ducking ? PLAYER_DUCK_H : PLAYER_H };
}

export function boxRect(b: Box): Rect {
  return { x: b.state.x, y: b.state.y, w: b.w, h: b.h };
}

export class World {
  readonly map: TileMap;
  readonly boxes: Box[] = [];
  runs: Run[] = [];
  current: Run;
  player: PlayerState;
  now = 0;
  dir: 1 | -1 = 1;
  paused = false;
  /**
   * Set when resolving the live body took more than its own width to undo, which
   * means it was inside something rather than running into it — it was crushed.
   */
  crushed = false;

  private nextRunId = 0;
  private coyote = 0;
  private buffered = 0;
  private spawn: { x: number; y: number };

  /**
   * Device pads are solid to objects but not to the live body: a crate settling
   * inside a time device would be sitting in a volume the player has to occupy.
   */
  private readonly deviceSolids: SolidRect[];

  constructor(
    map: TileMap,
    spawn: { x: number; y: number },
    boxes: BoxSpec[],
    devices: Rect[] = [],
  ) {
    this.map = map;
    this.spawn = spawn;
    this.deviceSolids = devices.map((r) => ({ ...r, id: DEVICE_SOLID }));
    boxes.forEach((b, i) => {
      const initial: BoxState = { x: b.x, y: b.y, vx: 0, vy: 0 };
      const record: BoxState[] = new Array(TICKS + 1);
      record[0] = { ...initial };
      this.boxes.push({
        id: i,
        w: b.w,
        h: b.h,
        state: { ...initial },
        initial,
        record,
        recordedMax: 0,
        immovable: b.immovable ?? false,
        releaseTick: b.releaseTick ?? 0,
      });
    });
    this.player = {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      ducking: false,
      groundedOn: GROUND_NONE,
    };
    this.current = this.newRun();
    this.recordPlayer();
  }

  private newRun(): Run {
    return {
      id: this.nextRunId++,
      dir: this.dir,
      states: new Array(TICKS + 1),
      tMin: this.now,
      tMax: this.now,
    };
  }

  /** Closes the active recording segment into history and opens a fresh one. */
  splitRun(): void {
    if (this.current.tMax > this.current.tMin) this.runs.push(this.current);
    this.current = this.newRun();
  }

  /** Drops a run from history — used when its contradiction turns it into a singularity. */
  removeRun(run: Run): void {
    this.runs = this.runs.filter((r) => r !== run);
  }

  /** Chronoclast: erase all recorded player history. */
  erasePlayerHistory(): void {
    this.runs = [];
    this.current = this.newRun();
    this.recordPlayer();
  }

  boxStateAt(box: Box, t: number): BoxState {
    return box.record[clamp(t, 0, box.recordedMax)] ?? box.initial;
  }

  solids(): SolidRect[] {
    return this.boxes.map((b) => ({ x: b.state.x, y: b.state.y, w: b.w, h: b.h, id: b.id }));
  }

  /**
   * Recorded bodies as solids for objects only. Ghosts are transparent to the live
   * player and to each other — two former selves occupy the same space without
   * interfering — but crates rest on them and are shoved by them, exactly as they
   * were by the run that recorded the body.
   */
  ghostSolidsAt(t: number): SolidRect[] {
    return this.ghostsAt(t).map(({ state }) => {
      const r = playerRect(state);
      return { x: r.x, y: r.y, w: r.w, h: r.h, id: GROUND_GHOST };
    });
  }

  ghostsAt(t: number): { run: Run; state: PlayerState }[] {
    const out: { run: Run; state: PlayerState }[] = [];
    for (const run of this.runs) {
      const s = run.states[t];
      if (s) out.push({ run, state: s });
    }
    return out;
  }

  atTimeBound(): boolean {
    return this.now <= 0 || this.now >= TICKS;
  }

  /** Repositions the world (and its objects) onto another point of the timeline. */
  scrubTo(t: number): void {
    this.now = clamp(Math.round(t), 0, TICKS);
    for (const box of this.boxes) {
      const s = this.boxStateAt(box, this.now);
      box.state = { ...s };
    }
    this.player.groundedOn = supportUnder(playerRect(this.player), this.map, this.solids());
  }

  private recordPlayer(): void {
    const run = this.current;
    run.states[this.now] = { ...this.player };
    run.tMin = Math.min(run.tMin, this.now);
    run.tMax = Math.max(run.tMax, this.now);
  }

  /** Advances the authoritative timeline by one tick and simulates the world into it. */
  step(input: Input): void {
    const target = clamp(this.now + this.dir, 0, TICKS);
    const before = this.boxes.map((b) => ({ x: b.state.x, y: b.state.y }));

    if (this.dir === 1) this.stepBoxesForward(target);
    else for (const box of this.boxes) box.state = { ...this.boxStateAt(box, target) };

    // Rewinding or live boxes carry whatever rides on them.
    if (this.player.groundedOn >= 0) {
      const idx = this.player.groundedOn;
      const box = this.boxes[idx];
      if (box) {
        this.player.x += box.state.x - before[idx].x;
        this.player.y += box.state.y - before[idx].y;
      }
    }

    this.stepPlayer(input);
    this.now = target;
    this.recordPlayer();
  }

  /**
   * Moves the live body while the timeline is frozen on a device: the world is
   * held at `now` and the player can still walk off the pad. Nothing is written
   * to the timeline — the tick already has a recorded state, and overwriting it
   * would make the run's own ghost jump to the pad whenever time revisits it.
   */
  stepPlayerFrozen(input: Input): void {
    this.stepPlayer(input);
  }

  private otherBoxSolids(box: Box): SolidRect[] {
    return this.boxes
      .filter((o) => o !== box)
      .map((o) => ({ x: o.state.x, y: o.state.y, w: o.w, h: o.h, id: o.id }))
      .concat(this.deviceSolids);
  }

  /**
   * Applies the motion of every recorded body to the objects it touches on the
   * way from `now` to `target`: a crate standing on a ghost travels with it, and
   * a crate in the way of one gets shoved aside. At most one recorded body acts on
   * a given object per tick, so overlapping ghosts never fight over a crate.
   */
  private applyGhostMotion(target: number): void {
    const claimed = new Set<number>();
    for (const run of this.runs) {
      const prev = run.states[this.now];
      const next = run.states[target];
      if (!prev || !next) continue;
      const pr = playerRect(prev);
      const nr = playerRect(next);
      const dx = nr.x - pr.x;
      const dy = nr.y - pr.y;
      if (dx === 0 && dy === 0) continue;
      for (const box of this.boxes) {
        if (claimed.has(box.id) || target < box.releaseTick) continue;
        const rect: Rect = { x: box.state.x, y: box.state.y, w: box.w, h: box.h };
        const others = this.otherBoxSolids(box);
        const riding =
          Math.abs(rect.y + rect.h - pr.y) <= 2 && rect.x < pr.x + pr.w && rect.x + rect.w > pr.x;
        if (riding) {
          moveX(rect, dx, this.map, others);
          moveY(rect, dy, this.map, others);
          claimed.add(box.id);
        } else if (rectsOverlap(nr, rect)) {
          if (dx !== 0) {
            const out = dx > 0 ? nr.x + nr.w + EPS - rect.x : nr.x - EPS - (rect.x + rect.w);
            moveX(rect, out, this.map, others);
            claimed.add(box.id);
          } else if (dy < 0) {
            moveY(rect, nr.y - EPS - (rect.y + rect.h), this.map, others);
            claimed.add(box.id);
          }
        }
        box.state.x = rect.x;
        box.state.y = rect.y;
      }
    }
  }

  private stepBoxesForward(target: number): void {
    const all = this.boxes;
    this.applyGhostMotion(target);
    const ghosts = this.ghostSolidsAt(target);
    for (const box of all) {
      // Held objects are pinned where the level suspended them until their tick.
      if (target < box.releaseTick) {
        box.state = { ...box.initial };
        continue;
      }
      box.state.vy = Math.min(box.state.vy + GRAVITY * DT, 900);
      const rect: Rect = { x: box.state.x, y: box.state.y, w: box.w, h: box.h };
      const others = [...this.otherBoxSolids(box), ...ghosts];
      if (!box.immovable) depenetrate(rect, this.map, others);
      moveX(rect, box.state.vx * DT, this.map, others);
      const v = moveY(rect, box.state.vy * DT, this.map, others);
      if (v.groundedOn !== GROUND_NONE || v.ceiling) box.state.vy = 0;
      box.state.x = rect.x;
      box.state.y = rect.y;
      box.state.vx = 0;
    }
    for (const box of all) {
      box.record[target] = { ...box.state };
      box.recordedMax = Math.max(box.recordedMax, target);
    }
  }

  private stepPlayer(input: Input): void {
    const p = this.player;
    this.crushed = false;
    const solids = this.solids();
    const wantDuck = input.down && p.groundedOn !== GROUND_NONE;
    if (!wantDuck && p.ducking) {
      const standing: Rect = { x: p.x, y: p.y - (PLAYER_H - PLAYER_DUCK_H), w: PLAYER_W, h: PLAYER_H };
      const blocked =
        this.map.overlapping(standing).length > 0 || solids.some((s) => rectsOverlap(standing, s));
      if (!blocked) {
        p.y -= PLAYER_H - PLAYER_DUCK_H;
        p.ducking = false;
      }
    } else if (wantDuck && !p.ducking) {
      p.y += PLAYER_H - PLAYER_DUCK_H;
      p.ducking = true;
    }

    const dirInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const speedCap = p.ducking ? MOVE_SPEED * 0.45 : MOVE_SPEED;
    const grounded = p.groundedOn !== GROUND_NONE;
    if (dirInput !== 0) {
      p.facing = dirInput > 0 ? 1 : -1;
      const accel = grounded ? GROUND_ACCEL : AIR_ACCEL;
      p.vx = clamp(p.vx + dirInput * accel * DT, -speedCap, speedCap);
    } else {
      const drop = FRICTION * DT;
      p.vx = Math.abs(p.vx) <= drop ? 0 : p.vx - Math.sign(p.vx) * drop;
    }

    if (input.jumpPressed) this.buffered = BUFFER_TICKS;
    this.coyote = grounded ? COYOTE_TICKS : Math.max(0, this.coyote - 1);
    this.buffered = Math.max(0, this.buffered - 1);
    if (this.buffered > 0 && this.coyote > 0 && !p.ducking) {
      p.vy = JUMP_VEL;
      this.buffered = 0;
      this.coyote = 0;
      p.groundedOn = GROUND_NONE;
    } else if (!input.jump && p.vy < 0) {
      p.vy *= JUMP_CUT;
    }

    // Gravity is always downward, whichever way global time runs.
    p.vy = Math.min(p.vy + GRAVITY * DT, 1200);

    const rect = playerRect(p);
    // Anything that moved into the body since the last tick is undone the short
    // way out first, so the movement below is not asked to resolve it along its
    // own axis.
    const dp = depenetrate(rect, this.map, solids);
    const hx = moveX(rect, p.vx * DT, this.map, solids);
    if (hx.hit) {
      if (hx.hitId >= 0 && this.dir === 1) this.pushBox(this.boxes[hx.hitId], Math.sign(p.vx), rect);
      p.vx = 0;
    }
    const hy = moveY(rect, p.vy * DT, this.map, this.solids());
    if (hy.groundedOn !== GROUND_NONE) p.vy = 0;
    if (hy.ceiling) p.vy = 0;
    if (Math.max(dp.correction, hx.correction, hy.correction) > PLAYER_W) this.crushed = true;
    p.x = rect.x;
    p.y = rect.y;
    p.groundedOn = hy.groundedOn !== GROUND_NONE ? hy.groundedOn : supportUnder(rect, this.map, this.solids());
  }

  /** The player is weightless but can shove live boxes sideways. */
  private pushBox(box: Box, dirSign: number, playerRectAfter: Rect): void {
    if (!box || dirSign === 0 || box.immovable) return;
    const rect: Rect = { x: box.state.x, y: box.state.y, w: box.w, h: box.h };
    moveX(rect, dirSign * BOX_PUSH_SPEED * DT, this.map, this.otherBoxSolids(box));
    box.state.x = rect.x;
    playerRectAfter.x =
      dirSign > 0 ? box.state.x - playerRectAfter.w - 0.02 : box.state.x + box.w + 0.02;
  }

  /**
   * Checks whether recorded history can still validly unfold at the current time.
   * Ghosts pass straight through the live body; history breaks when the world stops
   * being able to produce the recorded run: a recorded body stands on nothing, or a
   * box sits where the run's body was.
   */
  detectParadox(): Paradox | null {
    for (const { run, state } of this.ghostsAt(this.now)) {
      const g = playerRect(state);

      // A recorded body stood on a crate that is no longer under it. It cannot be
      // standing on air, so the history that put it there is void. Tile support is
      // never in question: level geometry does not move.
      if (state.groundedOn >= 0) {
        const support = this.boxes[state.groundedOn];
        if (support && !this.holdsUp(support, g)) {
          return { run, tick: this.now, reason: 'a former self is standing on nothing', x: g.x, y: g.y };
        }
      }

      for (const box of this.boxes) {
        if (!rectsOverlap(g, boxRect(box))) continue;
        const rec = this.boxStateAt(box, this.now);
        const recRect: Rect = { x: rec.x, y: rec.y, w: box.w, h: box.h };
        if (!rectsOverlap(g, recRect)) {
          return { run, tick: this.now, reason: 'a crate is where a former self was', x: g.x, y: g.y };
        }
      }
    }
    return null;
  }

  /** True when the box is still beneath the rect, close enough to be holding it up. */
  private holdsUp(box: Box, r: Rect): boolean {
    const probe: Rect = { x: r.x, y: r.y + r.h - 2, w: r.w, h: GHOST_SUPPORT_PROBE + 2 };
    return rectsOverlap(probe, boxRect(box));
  }

  respawnPlayerAtSpawn(): void {
    this.player = {
      x: this.spawn.x,
      y: this.spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      ducking: false,
      groundedOn: GROUND_TILE,
    };
  }
}
