import { SolidRect, TileMap, depenetrate, moveX, moveY, supportUnder } from './physics';
import {
  BoxState,
  DEVICE_SOLID,
  DT,
  GROUND_GHOST,
  GROUND_NONE,
  GROUND_TILE,
  PHASE_SOLID,
  PlayerState,
  SPRING_SOLID,
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

/**
 * How hard a spring throws a body: v = sqrt(2 g h) for h = 120px, so a bounce
 * clears about four tiles where a jump clears not quite three.
 */
export const SPRING_VEL = -Math.sqrt(2 * 1900 * 120);

/** A spring is a low plate sitting on the floor rather than a whole tile. */
export const SPRING_H = 12;

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

/**
 * A push button: pressed for as long as anything at all rests in it — the live
 * body, a former self, a crate, a stone — and released the instant nothing does.
 * It is not solid; things stand in it, not on it.
 */
export interface ButtonSpec {
  rect: Rect;
  group: number;
}

/**
 * A block that is solid while its group's button is up and passable while it is
 * pressed, or the other way round when `inverted`.
 */
export interface PhaseSpec {
  rect: Rect;
  group: number;
  inverted: boolean;
  /** Actual solidity after the becoming-solid delay is applied. */
  _solid?: boolean;
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

  readonly springs: SolidRect[];
  /** Set on the tick a spring throws the body, for the sound and the squash. */
  sprungOn: Rect | null = null;
  /** True while a spring's throw is still carrying the body upward. */
  private springing = false;

  readonly buttons: ButtonSpec[];
  readonly phase: PhaseSpec[];
  /** The groups whose button is held down as the world stands right now. */
  pressed = new Set<number>();

  constructor(
    map: TileMap,
    spawn: { x: number; y: number },
    boxes: BoxSpec[],
    devices: Rect[] = [],
    buttons: ButtonSpec[] = [],
    phase: PhaseSpec[] = [],
    springs: Rect[] = [],
  ) {
    this.map = map;
    this.spawn = spawn;
    this.springs = springs.map((r) => ({ ...r, id: SPRING_SOLID }));
    this.buttons = buttons;
    this.phase = phase;
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
    this.updateButtons();
    this.updatePhaseSolids();
  }

  /**
   * Reads every button off the state of the world: anything overlapping one holds
   * it down, and a button with nothing in it is up again the same tick. Which
   * blocks are solid follows from that, with a becoming-solid delay applied in
   * `updatePhaseSolids` — call that after calling this.
   */
  updateButtons(): void {
    const bodies: Rect[] = [playerRect(this.player), ...this.boxes.map(boxRect)];
    for (const { state } of this.ghostsAt(this.now)) bodies.push(playerRect(state));
    this.pressed = new Set(
      this.buttons.filter((b) => bodies.some((r) => rectsOverlap(r, b.rect))).map((b) => b.group),
    );
  }

  /**
   * True while the button of this group has something in it. The solidity of phase
   * blocks is derived in `updatePhaseSolids`, not directly from the button state.
   */
  isPressed(group: number): boolean {
    return this.pressed.has(group);
  }

  /** True when this phase block is actually solid (after the becoming-solid delay). */
  isSolidPhase(p: PhaseSpec): boolean {
    return p._solid ?? false;
  }

  /**
   * After `updateButtons()` has determined which groups are pressed, this method
   * applies the becoming-solid delay: a phase block that *wants* to become solid
   * only does so if no body (player, boxes, or ghosts) overlaps it. Once solid,
   * it stays solid as long as the button state would have it solid — the delay
   * only applies to the passable → solid transition.
   *
   * Monoliths (immovable boxes) are included in the overlap check so that a stone
   * sitting in a phase slot keeps it from materialising around it.
   */
  updatePhaseSolids(): void {
    const bodies: Rect[] = [playerRect(this.player), ...this.boxes.map(boxRect)];
    for (const { state } of this.ghostsAt(this.now)) bodies.push(playerRect(state));

    for (const p of this.phase) {
      const wantsSolid = this.pressed.has(p.group) === p.inverted;
      if (p._solid) {
        // Already solid: stay solid as long as the button still wants it solid.
        if (!wantsSolid) p._solid = false;
      } else if (wantsSolid) {
        // Wants to become solid: check if anything is inside it.
        const blocked = bodies.some((r) => rectsOverlap(r, p.rect));
        if (!blocked) p._solid = true;
        // If blocked, stay passable (delay becoming solid).
      } else {
        // Does not want to be solid: ensure it is not.
        p._solid = false;
      }
    }
  }

  /** The phase blocks that are currently solid, as collision rects. */
  phaseSolids(): SolidRect[] {
    return this.phase.filter((p) => this.isSolidPhase(p)).map((p) => ({ ...p.rect, id: PHASE_SOLID }));
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
    if (this.current.tMax > this.current.tMin) {
      // Remove the last recorded frame so ghosts don't stick to device edges.
      const last = this.current.tMax;
      this.current.states[last] = undefined;
      this.current.tMax = last - 1;
      this.runs.push(this.current);
    }
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
    this.updateButtons();
    this.updatePhaseSolids();
  }

  boxStateAt(box: Box, t: number): BoxState {
    const idx = clamp(t, 0, box.recordedMax);
    // Scrub or simulation may have skipped ticks that were never recorded (e.g.
    // after the chronoporter skipped forward past recordedMax).  Walk backwards
    // to the last known state rather than jumping to the starting position.
    for (let i = idx; i >= 0; i--) {
      const s = box.record[i];
      if (s) return s;
    }
    return box.initial;
  }

  solids(): SolidRect[] {
    return this.boxes
      .map((b) => ({ x: b.state.x, y: b.state.y, w: b.w, h: b.h, id: b.id }))
      .concat(this.phaseSolids());
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
    // When the timeline is paused (player on a device), the current run's recorded
    // states are also history — the player is standing still in time while the body
    // has already lived those ticks. Show them as ghosts so scrubbing back reveals
    // the player's own path to the device.
    if (this.paused) {
      const s = this.current.states[t];
      if (s) out.push({ run: this.current, state: s });
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
    this.updateButtons();
    this.updatePhaseSolids();
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
    this.updateButtons();
    this.updatePhaseSolids();
    // Clear any previous tick's spring firing; this tick's springs will set it.
    this.sprungOn = null;
    const target = clamp(this.now + this.dir, 0, TICKS);
    const beforeBoxes = this.boxes.map((b) => ({ x: b.state.x, y: b.state.y }));

    if (this.dir === 1) this.stepBoxesForward(target);
    else for (const box of this.boxes) box.state = { ...this.boxStateAt(box, target) };

    const beforePlayerBoxCarry = { x: this.player.x, y: this.player.y };

    // Rewinding or live boxes carry whatever rides on them.
    if (this.player.groundedOn >= 0) {
      const idx = this.player.groundedOn;
      const box = this.boxes[idx];
      if (box) {
        this.player.x += box.state.x - beforeBoxes[idx].x;
        this.player.y += box.state.y - beforeBoxes[idx].y;
      }
    }

    const afterPlayerBoxCarry = { x: this.player.x, y: this.player.y };
    this.carryBoxesBySupport(beforeBoxes, beforePlayerBoxCarry, afterPlayerBoxCarry);

    const beforeBoxesPlayerStep = this.boxes.map((b) => ({ x: b.state.x, y: b.state.y }));
    const beforePlayerStep = { x: this.player.x, y: this.player.y };
    this.stepPlayer(input);
    this.carryBoxesBySupport(beforeBoxesPlayerStep, beforePlayerStep, { x: this.player.x, y: this.player.y });
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
    this.updateButtons();
    this.updatePhaseSolids();
    this.stepPlayer(input);
  }

  /**
   * Boxes that are resting on another object inherit that object's movement delta.
   * This lets crates ride the live player, and it also keeps crates riding on top
   * of other crates or monoliths in sync with the support they sit on.
   */
  private carryBoxesBySupport(beforeBoxes: Array<{ x: number; y: number }>, beforePlayer: { x: number; y: number }, afterPlayer: { x: number; y: number }, skipIds = new Set<number>()): Set<number> {
    const moved = new Set<number>();
    const playerDx = afterPlayer.x - beforePlayer.x;
    const playerDy = afterPlayer.y - beforePlayer.y;
    const orderedBoxes = [...this.boxes].sort((b, a) => a.state.y - b.state.y || a.state.x - b.state.x);
    const propagatedDeltas = new Map<number, { x: number; y: number }>();

    for (const box of orderedBoxes) {
      if (box.immovable || skipIds.has(box.id)) continue;
      const before = beforeBoxes[box.id];
      const rawDelta = before
        ? { x: box.state.x - before.x, y: box.state.y - before.y }
        : { x: 0, y: 0 };
      propagatedDeltas.set(box.id, rawDelta);

      const probe: Rect = { x: box.state.x, y: box.state.y + box.h - 2, w: box.w, h: 4 };
      let supportDx = 0;
      let supportDy = 0;

      if (playerDx !== 0 || playerDy !== 0) {
        const r = playerRect(this.player);
        const supportsPlayer = rectsOverlap(probe, r) && r.y >= box.state.y + box.h - 4 && r.y <= box.state.y + box.h + 4;
        if (supportsPlayer) {
          supportDx = playerDx;
          supportDy = playerDy;
        }
      }

      if (supportDx === 0 && supportDy === 0) {
        for (const other of orderedBoxes) {
          if (other === box) continue;
          const r = boxRect(other);
          const supportsBox = rectsOverlap(probe, r) && r.y >= box.state.y + box.h - 4 && r.y <= box.state.y + box.h + 4;
          if (!supportsBox) continue;
          const beforeOther = beforeBoxes[other.id];
          if (!beforeOther) continue;
          const otherDelta = propagatedDeltas.get(other.id) ?? { x: other.state.x - beforeOther.x, y: other.state.y - beforeOther.y };
          if (otherDelta.x !== 0 || otherDelta.y !== 0) {
            supportDx = otherDelta.x;
            supportDy = otherDelta.y;
            break;
          }
        }
      }

      if (supportDx !== 0 || supportDy !== 0) {
        box.state.x += supportDx;
        box.state.y += supportDy;
        // Ensure the box isn't pushed into terrain or other solids by the
        // support movement.  This prevents a crate riding the player from
        // being carried through a wall when the player walks into one.
        const rect: Rect = { x: box.state.x, y: box.state.y, w: box.w, h: box.h };
        const solids = this.boxes
          .filter((o) => o !== box)
          .map((o) => ({ x: o.state.x, y: o.state.y, w: o.w, h: o.h, id: o.id }))
          .concat(this.deviceSolids, this.phaseSolids(), this.springs);
        depenetrate(rect, this.map, solids, 'both');
        moveX(rect, 0, this.map, solids);
        moveY(rect, 0, this.map, solids);
        box.state.x = rect.x;
        box.state.y = rect.y;
        propagatedDeltas.set(box.id, { x: supportDx, y: supportDy });
        moved.add(box.id);
      }
    }
    return moved;
  }

  private otherBoxSolids(box: Box): SolidRect[] {
    return this.boxes
      .filter((o) => o !== box)
      .map((o) => ({ x: o.state.x, y: o.state.y, w: o.w, h: o.h, id: o.id }))
      .concat(this.deviceSolids, this.phaseSolids(), this.springs);
  }

  private boxDirectlyRidesGhost(box: Box, ghostRect: Rect): boolean {
    const rect = boxRect(box);
    const overlapX = rect.x + 1 < ghostRect.x + ghostRect.w && rect.x + rect.w - 1 > ghostRect.x;
    const bottom = rect.y + rect.h;
    const onTop = bottom <= ghostRect.y + 4 && bottom >= ghostRect.y - 4;
    return overlapX && onTop;
  }

  private boxSupportsBox(support: Box, box: Box): boolean {
    const supportRect = boxRect(support);
    const rect = boxRect(box);
    const overlapX = rect.x + 1 < supportRect.x + supportRect.w && rect.x + rect.w - 1 > supportRect.x;
    const bottom = rect.y + rect.h;
    const onTop = bottom <= supportRect.y + 4 && bottom >= supportRect.y - 4;
    return overlapX && onTop;
  }

  private boxRidesGhostChain(box: Box, ghostRect: Rect, seen = new Set<number>()): boolean {
    if (seen.has(box.id)) return false;
    seen.add(box.id);
    if (this.boxDirectlyRidesGhost(box, ghostRect)) return true;
    for (const other of this.boxes) {
      if (other === box || other.immovable || seen.has(other.id)) continue;
      if (this.boxSupportsBox(other, box) && this.boxRidesGhostChain(other, ghostRect, seen)) {
        return true;
      }
    }
    return false;
  }

  private ghostPushChain(box: Box, dx: number, dy: number): Box[] {
    const chain: Box[] = [];
    const seen = new Set<number>();
    let current: Box | null = box;
    while (current && !seen.has(current.id) && !current.immovable) {
      chain.push(current);
      seen.add(current.id);

      const currentRect = { x: current.state.x, y: current.state.y, w: current.w, h: current.h };
      const next = this.boxes.find((candidate): boolean => {
        if (candidate === current || seen.has(candidate.id) || candidate.immovable) return false;
        const candidateRect = { x: candidate.state.x, y: candidate.state.y, w: candidate.w, h: candidate.h };
        if (dx !== 0) {
          const sameRow = Math.abs(candidateRect.y - currentRect.y) < 2;
          const expectedX = currentRect.x + Math.sign(dx) * currentRect.w;
          const alongDirection = Math.sign(dx) > 0 ? candidateRect.x > currentRect.x : candidateRect.x < currentRect.x;
          return sameRow && alongDirection && Math.abs(candidateRect.x - expectedX) < 2;
        }
        const sameColumn = Math.abs(candidateRect.x - currentRect.x) < 2;
        const expectedY = currentRect.y + Math.sign(dy) * currentRect.h;
        const alongDirection = Math.sign(dy) > 0 ? candidateRect.y > currentRect.y : candidateRect.y < currentRect.y;
        return sameColumn && alongDirection && Math.abs(candidateRect.y - expectedY) < 2;
      });
      current = next ?? null;
    }
    return chain;
  }

  /**
   * Applies the motion of every recorded body to the objects it touches on the
   * way from `now` to `target`: a crate directly resting on a ghost travels with
   * it, and a crate in the way of one gets shoved aside. At most one recorded
   * body acts on a given object per tick, so overlapping ghosts never fight over a
   * crate.
   */
  private ghostPushedIds = new Set<number>();

  private applyGhostMotion(target: number): Set<number> {
    const claimed = new Set<number>();
    const carried = new Set<number>();
    this.ghostPushedIds.clear();
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
        // A monolith is not shoved or carried by anything, least of all a memory.
        if (box.immovable) continue;
        if (claimed.has(box.id) || target < box.releaseTick) continue;
        const rect: Rect = { x: box.state.x, y: box.state.y, w: box.w, h: box.h };
        const others = this.otherBoxSolids(box);
        const riding = this.boxRidesGhostChain(box, pr);
        if (riding) {
          moveX(rect, dx, this.map, others);
          moveY(rect, dy, this.map, others);
          claimed.add(box.id);
          carried.add(box.id);
          box.state.x = rect.x;
          box.state.y = rect.y;
        } else if (rectsOverlap(nr, rect)) {
          const chain = dx !== 0 ? this.ghostPushChain(box, dx, 0) : dy < 0 ? this.ghostPushChain(box, 0, dy) : [];
          if (chain.length > 0) {
            const pushAmount = dx !== 0
              ? dx > 0 ? nr.x + nr.w + EPS - rect.x : nr.x - EPS - (rect.x + rect.w)
              : nr.y - EPS - (rect.y + rect.h);
            const chainIds = new Set(chain.map((entry) => entry.id));
            const beforeGhostSupport = this.boxes.map((box) => ({ x: box.state.x, y: box.state.y }));
            for (const entry of chain) {
              const entryRect: Rect = { x: entry.state.x, y: entry.state.y, w: entry.w, h: entry.h };
              const entrySolids = this.otherBoxSolids(entry).filter((solid) => !chainIds.has(solid.id));
              if (dx !== 0) {
                moveX(entryRect, pushAmount, this.map, entrySolids);
              } else {
                moveY(entryRect, pushAmount, this.map, entrySolids);
              }
              entry.state.x = entryRect.x;
              entry.state.y = entryRect.y;
              this.ghostPushedIds.add(entry.id);
              claimed.add(entry.id);
            }
            const ghostMoved = this.carryBoxesBySupport(beforeGhostSupport, { x: this.player.x, y: this.player.y }, { x: this.player.x, y: this.player.y }, new Set(chain.map((entry) => entry.id)));
            for (const id of ghostMoved) {
              this.ghostPushedIds.add(id);
              claimed.add(id);
            }
          }
        }
      }
    }
    return carried;
  }

  private stepBoxesForward(target: number): void {
    const all = this.boxes;
    const carried = this.applyGhostMotion(target);
    const ghosts = this.ghostSolidsAt(target);
    const ordered = [...all].sort((a, b) => a.state.y - b.state.y || a.state.x - b.state.x);
    for (const box of ordered) {
      // Held objects are pinned where the level suspended them until their tick.
      if (target < box.releaseTick) {
        box.state = { ...box.initial };
        continue;
      }
      if (carried.has(box.id)) {
        box.state.vy = 0;
        box.state.vx = 0;
        continue;
      }
      box.state.vy = Math.min(box.state.vy + GRAVITY * DT, 900);
      const rect: Rect = { x: box.state.x, y: box.state.y, w: box.w, h: box.h };
      // A monolith is stopped by the ground and by whatever crate is under it, and by
      // nothing else: not by a pad, not by a former self, and never sideways.
      const pushedSolids = this.boxes
        .filter((o) => o !== box && this.ghostPushedIds.has(o.id))
        .map((o) => ({ x: o.state.x, y: o.state.y, w: o.w, h: o.h, id: o.id }));
      const others = box.immovable
        ? this.boxes
          .filter((o) => o !== box && !o.immovable)
          .map((o) => ({ x: o.state.x, y: o.state.y, w: o.w, h: o.h, id: o.id }))
          .concat(this.phaseSolids(), this.springs)
        : [...this.otherBoxSolids(box), ...ghosts, ...pushedSolids];
      if (!box.immovable) depenetrate(rect, this.map, others, 'both');
      moveX(rect, box.state.vx * DT, this.map, others);
      const v = moveY(rect, box.state.vy * DT, this.map, others);
      // If the box landed on something stop its vertical velocity. If it
      // landed on a spring, bounce it upward instead and record the spring
      // for the world's sprungOn (so the scene can draw and sound it).
      if (v.groundedOn === SPRING_SOLID && !box.immovable && box.state.vy >= 0) {
        // Bounce the box off the spring.
        box.state.vy = SPRING_VEL;
        // Record which spring fired so the scene can react to it. Prefer the
        // spring that overlaps the box's final rect.
        const sp = this.springs.find((s) => rectsOverlap(rect, s)) ?? null;
        this.sprungOn = sp;
      } else if (v.groundedOn !== GROUND_NONE || v.ceiling) {
        box.state.vy = 0;
      }
      box.state.x = rect.x;
      box.state.y = rect.y;
      box.state.vx = 0;
    }
    for (const box of ordered) {
      // When simulation resumes after a scrub past recordedMax (e.g. stepping off
      // a chronoporter), the skipped ticks were never filled in.  Backfill the gap
      // with the last known state so scrubbing backwards lands on consistent data.
      const lastKnown = box.record[box.recordedMax] ?? box.initial;
      for (let i = box.recordedMax + 1; i < target; i++) {
        box.record[i] = { ...lastKnown };
      }
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
    } else if (!input.jump && p.vy < 0 && !this.springing) {
      // A spring's throw is the spring's, not the player's: releasing jump cuts a
      // jump short but must not cut a bounce short.
      p.vy *= JUMP_CUT;
    }
    if (p.vy >= 0) this.springing = false;

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
    const movedSolids = this.solids();
    const postPushDep = depenetrate(rect, this.map, movedSolids);
    const hy = moveY(rect, p.vy * DT, this.map, movedSolids);
    if (hy.groundedOn !== GROUND_NONE) p.vy = 0;
    if (hy.ceiling) p.vy = 0;
    // A spring is open to the body — walking into one is not walking into a wall —
    // and throws it the moment it touches, however it arrived — unless the body
    // is crouching, in which case the spring stays compressed.
    const sprung = p.vy >= 0 && !p.ducking ? (this.springs.find((sp) => rectsOverlap(rect, sp)) ?? null) : null;
    if (sprung) {
      p.vy = SPRING_VEL;
      p.groundedOn = GROUND_NONE;
      this.buffered = 0;
      this.coyote = 0;
      this.sprungOn = sprung;
      this.springing = true;
    }
    if (Math.max(dp.correction, hx.correction, hy.correction, postPushDep.correction) > PLAYER_W) this.crushed = true;
    p.x = rect.x;
    p.y = rect.y;
    p.groundedOn = this.sprungOn
      ? GROUND_NONE
      : hy.groundedOn !== GROUND_NONE
        ? hy.groundedOn
        : supportUnder(rect, this.map, this.solids());
  }

  /** The player is weightless but can shove live boxes sideways. */
  private pushBox(box: Box, dirSign: number, playerRectAfter: Rect): void {
    if (!box || dirSign === 0 || box.immovable) return;

    const chain: Box[] = [];
    const seen = new Set<number>();
    let current: Box | null = box;
    while (current && !seen.has(current.id) && !current.immovable) {
      chain.push(current);
      seen.add(current.id);

      const currentBox: Box = current;
      const currentRect = { x: currentBox.state.x, y: currentBox.state.y, w: currentBox.w, h: currentBox.h };
      const next = this.boxes.find((candidate): boolean => {
        if (candidate === currentBox || seen.has(candidate.id) || candidate.immovable) return false;
        const candidateRect = { x: candidate.state.x, y: candidate.state.y, w: candidate.w, h: candidate.h };
        const sameRow = Math.abs(candidateRect.y - currentRect.y) < 2;
        const expectedX = currentRect.x + dirSign * currentRect.w;
        const alongDirection = dirSign > 0 ? candidateRect.x > currentRect.x : candidateRect.x < currentRect.x;
        const aligned = Math.abs(candidateRect.x - expectedX) < 2;
        return sameRow && alongDirection && aligned;
      });
      current = next ?? null;
    }

    if (chain.length === 0) return;

    const front = chain[0];
    const proposed: Rect = { x: front.state.x + dirSign * BOX_PUSH_SPEED * DT, y: front.state.y, w: front.w, h: front.h };
    if (rectsOverlap(proposed, playerRectAfter)) {
      return;
    }

    const pushDelta = dirSign * BOX_PUSH_SPEED * DT;
    for (const entry of chain) {
      const rect: Rect = { x: entry.state.x, y: entry.state.y, w: entry.w, h: entry.h };
      const solids = this.boxes
        .filter((candidate) => candidate.id !== entry.id)
        .map((candidate) => ({ x: candidate.state.x, y: candidate.state.y, w: candidate.w, h: candidate.h, id: candidate.id }))
        .concat(this.deviceSolids, this.phaseSolids(), this.springs);
      moveX(rect, pushDelta, this.map, solids);
      entry.state.x = rect.x;
      if (entry === front) {
        playerRectAfter.x = dirSign > 0 ? rect.x - playerRectAfter.w - 0.02 : rect.x + rect.w + 0.02;
      }
    }
  }

  /**
   * Checks whether recorded history can still validly unfold at the current time.
   * Ghosts pass straight through the live body; history breaks when the world stops
   * being able to produce the recorded run: a recorded body stands on nothing, a
   * box sits where the run's body was, a ghost overlaps a block that is now solid,
   * or a ghost stands on a phase block that is now passable.
   */
  detectParadox(): Paradox | null {
    for (const { run, state } of this.ghostsAt(this.now)) {
      const g = playerRect(state);

      // A monolith goes through anything that is not holding it up, a former self
      // included: the run that walked there cannot have survived it.
      for (const box of this.boxes) {
        if (!box.immovable || this.now < box.releaseTick) continue;
        if (rectsOverlap(g, boxRect(box))) {
          return { run, tick: this.now, reason: 'a former self was crushed by a monolith', x: g.x, y: g.y };
        }
      }

      // A recorded body stood on a crate that is no longer under it. It cannot be
      // standing on air, so the history that put it there is void. Tile support is
      // never in question: level geometry does not move. Crates that are still in
      // direct contact with the ghost are treated as part of the ghost's carried
      // support chain and are not flagged as a contradiction.
      if (state.groundedOn >= 0) {
        const support = this.boxes[state.groundedOn];
        if (support && !this.holdsUp(support, g) && !this.boxRidesGhostChain(support, g)) {
          return { run, tick: this.now, reason: 'a former self is standing on nothing', x: g.x, y: g.y };
        }
      }

      for (const box of this.boxes) {
        if (!rectsOverlap(g, boxRect(box))) continue;
        const rec = this.boxStateAt(box, this.now);
        const recRect: Rect = { x: rec.x, y: rec.y, w: box.w, h: box.h };
        const movedTooFar = Math.hypot(box.state.x - rec.x, box.state.y - rec.y) > PLAYER_W * 0.5;
        if (!rectsOverlap(g, recRect) && !this.boxRidesGhostChain(box, g)) {
          if (movedTooFar) {
            return { run, tick: this.now, reason: 'a crate was displaced by a former self', x: g.x, y: g.y };
          }
          return { run, tick: this.now, reason: 'a crate is where a former self was', x: g.x, y: g.y };
        }
      }

      // A phase block that is now solid but has a ghost inside it: the ghost's
      // run walked through open space that is now a wall.
      for (const p of this.phase) {
        if (this.isSolidPhase(p) && rectsOverlap(g, p.rect)) {
          return { run, tick: this.now, reason: 'a former self is inside a phase block', x: g.x, y: g.y };
        }
      }

      // A ghost that was standing on a phase block (groundedOn === PHASE_SOLID)
      // is now supported by nothing if that block went passable. Uses the same
      // probe logic as holdsUp() for consistency.
      if (state.groundedOn === PHASE_SOLID) {
        const probe: Rect = { x: g.x, y: g.y + g.h - 2, w: g.w, h: GHOST_SUPPORT_PROBE + 2 };
        const onPhase = this.phase.some((p) => this.isSolidPhase(p) && rectsOverlap(probe, p.rect));
        if (!onPhase) {
          return { run, tick: this.now, reason: 'a former self was standing on a phase block', x: g.x, y: g.y };
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
