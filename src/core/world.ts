import { SolidRect, TileMap, moveX, moveY, supportUnder } from './physics';
import {
  BoxState,
  DT,
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

export interface Input {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  jumpPressed: boolean;
}

export const NO_INPUT: Input = { left: false, right: false, down: false, jump: false, jumpPressed: false };

export interface Box {
  id: number;
  w: number;
  h: number;
  state: BoxState;
  initial: BoxState;
  record: BoxState[];
  recordedMax: number;
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

  private nextRunId = 0;
  private coyote = 0;
  private buffered = 0;
  private spawn: { x: number; y: number };

  constructor(map: TileMap, spawn: { x: number; y: number }, boxes: { x: number; y: number; w: number; h: number }[]) {
    this.map = map;
    this.spawn = spawn;
    boxes.forEach((b, i) => {
      const initial: BoxState = { x: b.x, y: b.y, vx: 0, vy: 0 };
      const record: BoxState[] = new Array(TICKS + 1);
      record[0] = { ...initial };
      this.boxes.push({ id: i, w: b.w, h: b.h, state: { ...initial }, initial, record, recordedMax: 0 });
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
   * held at `now`, nothing is recorded, but the player can still walk off the pad.
   */
  stepPlayerFrozen(input: Input): void {
    this.stepPlayer(input);
    this.current.states[this.now] = { ...this.player };
  }

  private stepBoxesForward(target: number): void {
    const all = this.boxes;
    for (const box of all) {
      box.state.vy = Math.min(box.state.vy + GRAVITY * DT, 900);
      const rect: Rect = { x: box.state.x, y: box.state.y, w: box.w, h: box.h };
      const others = all.filter((o) => o !== box).map((o) => ({ x: o.state.x, y: o.state.y, w: o.w, h: o.h, id: o.id }));
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
    const hx = moveX(rect, p.vx * DT, this.map, solids);
    if (hx.hit) {
      if (hx.hitId >= 0 && this.dir === 1) this.pushBox(this.boxes[hx.hitId], Math.sign(p.vx), rect);
      p.vx = 0;
    }
    const hy = moveY(rect, p.vy * DT, this.map, this.solids());
    if (hy.groundedOn !== GROUND_NONE) p.vy = 0;
    if (hy.ceiling) p.vy = 0;
    p.x = rect.x;
    p.y = rect.y;
    p.groundedOn = hy.groundedOn !== GROUND_NONE ? hy.groundedOn : supportUnder(rect, this.map, this.solids());
  }

  /** The player is weightless but can shove live boxes sideways. */
  private pushBox(box: Box, dirSign: number, playerRectAfter: Rect): void {
    if (!box || dirSign === 0) return;
    const others = this.boxes
      .filter((o) => o !== box)
      .map((o) => ({ x: o.state.x, y: o.state.y, w: o.w, h: o.h, id: o.id }));
    const rect: Rect = { x: box.state.x, y: box.state.y, w: box.w, h: box.h };
    moveX(rect, dirSign * BOX_PUSH_SPEED * DT, this.map, others);
    box.state.x = rect.x;
    playerRectAfter.x =
      dirSign > 0 ? box.state.x - playerRectAfter.w - 0.02 : box.state.x + box.w + 0.02;
  }

  /**
   * Checks whether recorded history can still validly unfold at the current time.
   * Ghosts pass straight through the live body; history only breaks when the
   * world stops supporting a recorded run — a box now occupies space the run
   * passed through, or the box it stood on has moved.
   */
  detectParadox(): Paradox | null {
    for (const { run, state } of this.ghostsAt(this.now)) {
      const g = playerRect(state);
      for (const box of this.boxes) {
        const cur = boxRect(box);
        if (!rectsOverlap(g, cur)) continue;
        const rec = this.boxStateAt(box, this.now);
        const recRect: Rect = { x: rec.x, y: rec.y, w: box.w, h: box.h };
        if (!rectsOverlap(g, recRect)) {
          return { run, tick: this.now, reason: 'blocked a recorded path', x: g.x, y: g.y };
        }
      }
      if (state.groundedOn >= 0) {
        const box = this.boxes[state.groundedOn];
        const rec = this.boxStateAt(box, this.now);
        if (Math.abs(rec.x - box.state.x) > 6 || Math.abs(rec.y - box.state.y) > 6) {
          return { run, tick: this.now, reason: 'removed required support', x: g.x, y: g.y };
        }
      }
    }
    return null;
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
