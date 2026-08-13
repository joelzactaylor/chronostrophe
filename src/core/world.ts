import type Phaser from 'phaser';
import { SolidRect, TileMap, depenetrate, moveX, moveY, supportUnder } from './physics';
import { CrateWorld } from './cratePhysics';
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
export const PLAYER_H = 26;
export const PLAYER_DUCK_H = 16;
export const BOX_PUSH_SPEED = 130;
/**
 * What each crate beyond the first costs a shove: a lone crate slides at
 * BOX_PUSH_SPEED, a heap of them barely gives, and the weight compounds with
 * every crate in the load rather than only with the ones being touched.
 */
export const BOX_LOAD_DRAG = 0.15;

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
const GHOST_FLOATING_EPSILON = 0.05;

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
  /** Per-tick recorded states; gaps are possible (unrecorded ticks stay undefined). */
  record: (BoxState | undefined)[];
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
  readonly crates: CrateWorld;
  readonly boxes: Box[] = [];
  runs: Run[] = [];
  current: Run;
  player: PlayerState;
  now = 0;
  dir: 1 | -1 = 1;
  /**
   * The first tick of the current timeline epoch. The chronoclast raises it to
   * the tick it fires, making everything before it unreachable: scrubbing and
   * rewinding clamp to it, and no pre-boundary crate or player history is read.
   */
  epochStart = 0;
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
  /**
   * What every phase block looked like at each recorded tick, as a 2D array
   * indexed `[tick][phaseIndex]`. The becoming-solid delay leaves a phase block
   * passable for a window that is not derivable from the button state alone, so
   * it has to be remembered like any other recorded fact: reversing time retraces
   * the transient passability, a ghost crossing it then does not read as having
   * walked through a wall, and no false anomaly is created.
   */
  private readonly phaseSolidityHistory: (boolean[] | undefined)[] = new Array(TICKS + 1);

  constructor(
    map: TileMap,
    spawn: { x: number; y: number },
    boxes: BoxSpec[],
    devices: Rect[] = [],
    buttons: ButtonSpec[] = [],
    phase: PhaseSpec[] = [],
    springs: Rect[] = [],
    matterWorld: Phaser.Physics.Matter.World,
  ) {
    this.map = map;
    this.spawn = spawn;
    this.springs = springs.map((r) => ({ ...r, id: SPRING_SOLID }));
    this.buttons = buttons;
    this.phase = phase;
    this.deviceSolids = devices.map((r) => ({ ...r, id: DEVICE_SOLID }));
    if (!matterWorld) throw new Error('World requires a Phaser Matter world');
    this.crates = new CrateWorld(map, devices, springs, matterWorld);
    boxes.forEach((b, i) => {
      const initial: BoxState = { x: b.x, y: b.y, vx: 0, vy: 0 };
      const record: (BoxState | undefined)[] = new Array(TICKS + 1);
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
    this.recordPhaseSolidity(0);
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

  /**
   * Snapshots each phase block's effective solidity into `phaseSolidityHistory`
   * for the given tick, so the becoming-solid delay leaves a trace that reverse
   * playback and scrubbing can retrace.
   */
  private recordPhaseSolidity(tick: number): void {
    const t = clamp(tick, 0, TICKS);
    this.phaseSolidityHistory[t] = this.phase.map((p) => this.isSolidPhase(p));
  }

  /**
   * Restores every phase block to the solidity it had at the given recorded tick.
   * Called when the timeline moves to a point whose state is already known, so the
   * transient passability of a becoming-solid delay is reproduced exactly — a ghost
   * that crossed a block while it was waiting to solidify is not judged to have
   * walked through a wall.
   */
  private restorePhaseSolidity(tick: number): void {
    const t = clamp(tick, 0, TICKS);
    const snapshot = this.phaseSolidityHistory[t];
    if (snapshot) {
      for (let i = 0; i < this.phase.length; i++) this.phase[i]._solid = snapshot[i];
    }
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

  /**
     * Chronoclast: a hard causal boundary in the timeline. Everything before the
     * instant it fires is cut off — the player's runs die with it, and so does every
     * movable crate's recorded history. Each movable crate keeps its current position
     * and the velocity it is actually experiencing *right now* as the first state of
     * a brand-new timeline epoch, which then always runs forward.
     *
     * Reverse-time activation is asymmetric on purpose: the crates' records store
     * forward-time velocity, and reversing time plays them back by grafting those
     * forward states onto the body, so the crate's *visible* reverse movement is the
     * negation of its stored velocity. When the chronoclast fires during rewinding we
     * recover that effective reverse-playback velocity (negate the stored vx/vy), make
     * it the crate's initial velocity, and let the new forward epoch continue from
     * there — so a crate caught mid-rise keeps rising and crests under gravity.
     *
     * Monoliths (immovable boxes) are left completely untouched: not reset, not
     * repositioned, and their records are not cleared.
     */
  chronoclast(): void {
    const reversing = this.dir === -1;
    // The new epoch begins at this tick and always runs forward.
    this.epochStart = this.now;
    this.dir = 1;

    for (const box of this.boxes) {
      // A monolith is part of the fixed world, not history the chronoclast may shed.
      if (box.immovable) continue;
      // Capture the crate's current *displayed* pose and the velocity it is
      // actually experiencing at this instant. Under reverse playback the stored
      // forward velocity is negated to get the visible backward motion; that
      // effective velocity is what the new forward epoch must inherit.
      const captured: BoxState = {
        x: box.state.x,
        y: box.state.y,
        vx: reversing ? -box.state.vx : box.state.vx,
        vy: reversing ? -box.state.vy : box.state.vy,
      };
      // Write the effective velocity back so forward physics continues from the
      // crate's actual motion (a crate caught rising keeps its upward velocity).
      box.state.vx = captured.vx;
      box.state.vy = captured.vy;
      // Erase the old record: the preserved arrangement is the epoch's initial
      // condition, and no pre-boundary history may be read again.
      box.record.fill(undefined);
      box.recordedMax = this.now;
      box.record[this.now] = { ...captured };
    }

    // Erase all player history; the live body stays put, with its current state
    // recorded as the first step of the new epoch.
    this.runs = [];
    this.current = this.newRun();
    this.recordPlayer();
    this.updateButtons();
    this.updatePhaseSolids();
    // The phase blocks' solidity history dies with the timeline it was part of:
    // the blocks go back to their state as the world stands, and the record
    // refills from the current tick forward.
    this.phaseSolidityHistory.fill(undefined);
    this.recordPhaseSolidity(this.now);
  }

  boxStateAt(box: Box, t: number): BoxState {
    // Never reach below the epoch boundary: the chronoclast cut the timeline
    // off there, so a movable crate must not be able to revert to its level
    // initial state or any pre-boundary record.
    const lo = this.epochStart;
    const idx = clamp(t, lo, box.recordedMax);
    // Scrub or simulation may have skipped ticks that were never recorded (e.g.
    // after the chronoporter skipped forward past recordedMax).  Walk backwards
    // to the last known state rather than jumping to the starting position.
    for (let i = idx; i >= lo; i--) {
      const s = box.record[i];
      if (s) return s;
    }
    // The epoch boundary is recorded, but if the box is a monolith (whose records
    // the chronoclast leaves at tick 0) or lookups are somehow earlier, fall back
    // to the initial state — monoliths are fixed world, not erasable history.
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
    // The chronoclast cut the timeline at epochStart, so the beginning of the
    // current epoch is a boundary too — reaching it is reaching the beginning
    // of the reachable timeline.
    return this.now <= this.epochStart || this.now >= TICKS;
  }

  /**
     * Repositions the world (and its objects) onto another point of the timeline.
     *
     * Scrubbing *backward* (or onto a point the objects have not moved past)
     * teleports each box to its recorded state. Scrubbing *forward* always
     * extrapolates the objects tick by tick through the skipped stretch — whether
     * that stretch is new, unrecorded time or time already simulated — so a
     * suspended monolith falls and a crate rolls exactly as they would have if
     * global time had run at whatever rate the scrub demanded, rather than
     * teleporting to a recorded mid-motion pose.
     */
  scrubTo(t: number): void {
    // The chronoclast made epochStart the beginning of reachable time: the player
    // cannot scrub back before it, only forward from it.
    const target = clamp(Math.round(t), this.epochStart, TICKS);
    if (target > this.now) {
      // Forward: simulate the objects through every skipped tick, recorded or not.
      this.simulateBoxesTo(target);
    } else {
      // A known point of the timeline: place each object at its recorded state.
      this.now = target;
      for (const box of this.boxes) {
        const s = this.boxStateAt(box, this.now);
        box.state = { ...s };
      }
      // Restore what the phase blocks looked like at this tick so the view and
      // the paradox judgement match history (including transient passability).
      this.restorePhaseSolidity(target);
    }
    this.updateButtons();
    this.updatePhaseSolids();
    this.player.groundedOn = supportUnder(playerRect(this.player), this.map, this.solids());
  }

  /**
   * Advances the objects forward through as many ticks as a forward scrub skips,
   * one at a time, so that scrubbing into unrecorded time behaves exactly as
   * though global time had run at whatever rate the scrub demanded.
   *
   * The live body is deliberately not part of this pass: while the player scrubs
   * they stand on the chronoporter, whose volume objects cannot enter, so the
   * objects react only to recorded ghost history, gravity, springs, and one
   * another — never to the idle player (or a monolith, which the level designer
   * never hangs over a pad).
   */
  private simulateBoxesTo(target: number): void {
    const start = this.now;
    for (let t = start; t < target; t++) {
      this.now = t;
      this.stepBoxesForward(t + 1);
      // Keep the phase solidity record in step with the simulated boxes so a
      // later reversal through this stretch reproduces the same blocks.
      this.recordPhaseSolidity(t + 1);
    }
    this.now = target;
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
    // When time runs backward, the phase blocks must retrace the exact solidity
    // they had going forward: the becoming-solid delay left them passable for a
    // window, and restoring that from history keeps a ghost from reading as having
    // walked through a wall. Restore before the body moves so the transient
    // passability is in effect for the tick being retraced.
    if (this.dir === -1) this.restorePhaseSolidity(this.now);
    // Clamp to the epoch bounds: the chronoclast cut the timeline at epochStart, so
    // rewinding stops there and never reaches pre-chronoclast time.
    const target = clamp(this.now + this.dir, this.epochStart, TICKS);
    const beforeBoxes = this.boxes.map((b) => ({ x: b.state.x, y: b.state.y }));

    let ghostHandled = new Set<number>();
    if (this.dir === 1) ghostHandled = this.stepBoxesForward(target);
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
    // Anything a recorded body already moved this tick is left alone: `beforeBoxes`
    // predates that motion, so carrying it again by its support's delta would count
    // the shove twice — once per layer of the stack.
    this.carryBoxesBySupport(beforeBoxes, beforePlayerBoxCarry, afterPlayerBoxCarry, ghostHandled);

    const beforeBoxesPlayerStep = this.boxes.map((b) => ({ x: b.state.x, y: b.state.y }));
    const beforePlayerStep = { x: this.player.x, y: this.player.y };
    this.stepPlayer(input);
    this.carryBoxesBySupport(beforeBoxesPlayerStep, beforePlayerStep, { x: this.player.x, y: this.player.y });
    this.now = target;
    this.recordPlayer();
    // Going forward, remember the solidity each phase block ended the tick with,
    // so that reversing back through here can reproduce it (including the delay
    // window during which a block was passable despite wanting to be solid).
    if (this.dir === 1) this.recordPhaseSolidity(target);
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
      if (box.immovable || skipIds.has(box.id) || this.boxIsFalling(box)) continue;
      const before = beforeBoxes[box.id];
      const rawDelta = before
        ? { x: box.state.x - before.x, y: box.state.y - before.y }
        : { x: 0, y: 0 };
      propagatedDeltas.set(box.id, rawDelta);

      const probe: Rect = { x: box.state.x, y: box.state.y + box.h - 2, w: box.w, h: 4 };
      let supportDx = 0;
      let supportDy = 0;

      // A box straddling several supports travels with the most constrained of
      // them: taking any other would slide it off a support that was blocked. The
      // body counts as one of those supports and gets no say over the others —
      // shoving a stack sideways puts a body's head under the crate above the one
      // it is shoving, and a body walks faster than it pushes.
      let least = Infinity;
      const consider = (dx: number, dy: number): void => {
        if (dx === 0 && dy === 0) return;
        const magnitude = Math.hypot(dx, dy);
        if (magnitude >= least) return;
        least = magnitude;
        supportDx = dx;
        supportDy = dy;
      };
      const supports = (r: Rect): boolean =>
        rectsOverlap(probe, r) && r.y >= box.state.y + box.h - 4 && r.y <= box.state.y + box.h + 4;

      if ((playerDx !== 0 || playerDy !== 0) && supports(playerRect(this.player))) {
        consider(playerDx, playerDy);
      }
      for (const other of orderedBoxes) {
        if (other === box || !supports(boxRect(other))) continue;
        const beforeOther = beforeBoxes[other.id];
        if (!beforeOther) continue;
        const otherDelta = propagatedDeltas.get(other.id) ?? { x: other.state.x - beforeOther.x, y: other.state.y - beforeOther.y };
        consider(otherDelta.x, otherDelta.y);
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
        // Whatever rides this box inherits how far it actually got, not how far it
        // was asked to go: a support stopped by a wall must not carry the layers
        // above it off its own back.
        propagatedDeltas.set(box.id, before
          ? { x: box.state.x - before.x, y: box.state.y - before.y }
          : { x: supportDx, y: supportDy });
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

  private boxIsFalling(box: Box): boolean {
    if (box.state.vy > 0.001) return true;

    return (
      supportUnder(
        boxRect(box),
        this.map,
        this.otherBoxSolids(box),
      ) === GROUND_NONE
    );
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

  /**
   * The run of crates a shove travels through: the crate being shoved, then each
   * one it is already up against along the direction of the shove.
   */
  private pushChain(
    box: Box,
    dx: number,
    dy: number,
    excludedIds = new Set<number>(),
  ): Box[] {
    const chain: Box[] = [];
    const seen = new Set<number>();
    let current: Box | null = box;
    while (
      current &&
      !seen.has(current.id) &&
      !current.immovable &&
      !excludedIds.has(current.id)
    ) {
      chain.push(current);
      seen.add(current.id);

      const currentRect = { x: current.state.x, y: current.state.y, w: current.w, h: current.h };
      const next = this.boxes.find((candidate): boolean => {
        if (
          candidate === current ||
          seen.has(candidate.id) ||
          candidate.immovable ||
          excludedIds.has(candidate.id)
        ) {
          return false;
        }
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

  /** Every crate a shove has to move: the chain, and whatever rides on it. */
  private shoveLoad(chain: Box[]): Set<number> {
    const load = new Set<number>(chain.map((entry) => entry.id));
    for (let grew = true; grew;) {
      grew = false;
      for (const box of this.boxes) {
        if (box.immovable || load.has(box.id)) continue;
        if (!this.boxes.some((support) => load.has(support.id) && this.boxSupportsBox(support, box))) continue;
        load.add(box.id);
        grew = true;
      }
    }
    return load;
  }

  /** How far a shove moves its load in one tick, which is less the heavier it is. */
  private shoveStep(chain: Box[]): number {
    return (BOX_PUSH_SPEED * DT) / (1 + BOX_LOAD_DRAG * (this.shoveLoad(chain).size - 1));
  }

  /**
   * Shoves a chain of crates one step along an axis, far end first: the crate
   * ahead has made its room by the time the one behind it moves, and every crate
   * stays solid to every other throughout, so the chain travels as far as its most
   * obstructed member allows and nothing is shoved into anything.
   *
   * The live body and a recorded one both shove through here, which is what keeps
   * a replayed shove landing where the recorded one did.
   */
  private shoveChain(chain: Box[], delta: number, axis: 'x' | 'y'): void {
    for (let i = chain.length - 1; i >= 0; i--) {
      const entry = chain[i];
      const rect: Rect = { x: entry.state.x, y: entry.state.y, w: entry.w, h: entry.h };
      const solids = this.otherBoxSolids(entry);
      if (axis === 'x') moveX(rect, delta, this.map, solids);
      else moveY(rect, delta, this.map, solids);
      entry.state.x = rect.x;
      entry.state.y = rect.y;
    }
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
    const fallingIds = new Set(
      this.boxes
        .filter((box) => this.boxIsFalling(box))
        .map((box) => box.id),
    );
    // While time is paused on a device, the live body's current run is also
    // history: it is shown as a ghost and its solids the boxes, so a forward
    // re-simulation through already-recorded time must retrace its shoves and
    // carries exactly as it retraces the completed runs'. Otherwise a crate that
    // was shoved during the current run would just fall, desyncing from the path
    // it recorded.
    const runs = this.paused ? [...this.runs, this.current] : this.runs;
    for (const run of runs) {
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
        if (fallingIds.has(box.id)) continue;
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
          const chain = dx !== 0
            ? this.pushChain(box, dx, 0, fallingIds)
            : dy < 0
              ? this.pushChain(box, 0, dy, fallingIds)
              : [];
          if (chain.length > 0) {
            // A shoved crate travels at the crate push speed, whoever shoves it: the
            // live body moves it a whole push step and then stands flush behind it, so
            // a recorded body has to move it that same step rather than only far enough
            // to clear itself. Shoving it only clear leaves the crates behind the first
            // one engaged on different ticks than they were, and the pile replays out
            // of step with the run that pushed it. A body travelling faster than the
            // crates still may not end up inside one.
            const clearance = dx !== 0
              ? dx > 0 ? nr.x + nr.w + EPS - rect.x : nr.x - EPS - (rect.x + rect.w)
              : nr.y - EPS - (rect.y + rect.h);
            const step = this.shoveStep(chain);
            const pushAmount = dx !== 0
              ? Math.sign(dx) * Math.max(step, Math.abs(clearance))
              : clearance;
            const beforeGhostSupport = this.boxes.map((box) => ({ x: box.state.x, y: box.state.y }));
            this.shoveChain(chain, pushAmount, dx !== 0 ? 'x' : 'y');
            for (const entry of chain) {
              this.ghostPushedIds.add(entry.id);
              claimed.add(entry.id);
            }
            const skipGhostSupport = new Set<number>([
              ...fallingIds,
              ...chain.map((entry) => entry.id),
            ]);

            const ghostMoved = this.carryBoxesBySupport(
              beforeGhostSupport,
              { x: this.player.x, y: this.player.y },
              { x: this.player.x, y: this.player.y },
              skipGhostSupport,
            ); for (const id of ghostMoved) {
              this.ghostPushedIds.add(id);
              claimed.add(id);
            }
          }
        }
      }
    }
    return carried;
  }

  /** Returns the boxes a recorded body already moved this tick. */
  private stepBoxesForward(target: number): Set<number> {
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
    return new Set([...carried, ...this.ghostPushedIds]);
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

  private holdsUp(box: Box, r: Rect): boolean {
    const probe: Rect = { x: r.x, y: r.y + r.h - 2, w: r.w, h: GHOST_SUPPORT_PROBE + 2 };
    return rectsOverlap(probe, boxRect(box));
  }

  private ghostIsSupportedAt(s: PlayerState): boolean {
    const r = playerRect(s);
    switch (s.groundedOn) {
      case GROUND_TILE:
        return true;
      case PHASE_SOLID: {
        const probe: Rect = { x: r.x, y: r.y + r.h - 2, w: r.w, h: GHOST_SUPPORT_PROBE + 2 };
        return this.phase.some((p) => this.isSolidPhase(p) && rectsOverlap(probe, p.rect));
      }
      default: {
        if (s.groundedOn >= 0) {
          const support = this.boxes[s.groundedOn];
          if (support && (this.holdsUp(support, r) || this.boxRidesGhostChain(support, r))) return true;
        }
        return supportUnder(r, this.map, this.solids()) !== GROUND_NONE;
      }
    }
  }

  private ghostIsFloatingUnsupported(run: Run, tick: number): boolean {
    if (tick < 2) return false;
    const samples: PlayerState[] = [];
    for (let t = tick; t >= tick - 2; t--) {
      const s = run.states[t];
      if (!s) return false;
      samples.push(s);
    }
    if (samples.length < 3) return false;
    const unsupported = samples.every((s) => !this.ghostIsSupportedAt(s));
    if (!unsupported) return false;
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      if (Math.abs(curr.y - prev.y) >= GHOST_FLOATING_EPSILON) return false;
    }
    return true;
  }

  /** The player is weightless but can shove live boxes sideways. */
  private pushBox(box: Box, dirSign: number, playerRectAfter: Rect): void {
    if (!box || dirSign === 0 || box.immovable) return;

    const chain = this.pushChain(box, dirSign, 0);
    if (chain.length === 0) return;

    const front = chain[0];
    const step = this.shoveStep(chain);
    const proposed: Rect = { x: front.state.x + dirSign * step, y: front.state.y, w: front.w, h: front.h };
    if (rectsOverlap(proposed, playerRectAfter)) {
      return;
    }

    this.shoveChain(chain, dirSign * step, 'x');
    playerRectAfter.x = dirSign > 0 ? front.state.x - playerRectAfter.w - 0.02 : front.state.x + front.w + 0.02;
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

      // A former self floating unsupported for three consecutive frames with
      // essentially no y movement is impossible history: it is not standing,
      // not falling, and not supported by anything the world can produce.
      if (this.ghostIsFloatingUnsupported(run, this.now)) {
        return { run, tick: this.now, reason: 'a former self is floating unsupported', x: g.x, y: g.y };
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
