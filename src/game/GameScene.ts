import Phaser from 'phaser';
import { GROUND_NONE, PlayerState, Rect, TILE, clamp, rectsOverlap } from '../core/types';
import { Box, Input, PLAYER_H, PLAYER_W, World, boxRect, playerRect } from '../core/world';
import { Device, LEVELS, LevelDef, buildLevel } from './level';
import { FISHEYE_KEY, FisheyePipeline } from './fisheye';
import { fadeIn, fadeOutThen } from './transition';
import { sfx, music } from './audio';
import { groupColour, mixColor, shade, tint } from './palette';
import { markLevelComplete } from './progress';
import {
  COL_BG,
  COL_TILE,
  COL_TILE_INNER,
  COL_TILE_EDGE,
  COL_PLAYER,
  COL_MODAL_BG,
  COL_VIGNETTE,
  NEBULA_COLORS,
  COL_BACKDROP_FRAME,
  COL_BOX_FIXED,
  COL_BOX_STRIPE_FIXED,
  COL_MONOLITH_FIXED,
  COL_MONOLITH_INNER_FIXED,
  COL_MONOLITH_EDGE_FIXED,
  applyThemeForLevel,
} from './theme';

export type GameState = 'play' | 'death' | 'dust' | 'fisheye' | 'won';

/** A step of the player's own worldline: where the body was, and when. */
export interface LivedStep extends PlayerState {
  /** The tick of the timeline the body occupied. */
  tick: number;
  /** The recording segment it belonged to. */
  runId: number;
}

/**
 * A contradicted run. It keeps its ghost body and never touches the level; what it
 * does is retrace the player's own worldline from where its history broke, two steps
 * of lived time for every one the player lives. It is drawn wherever on that path it
 * has reached, regardless of the tick the world is showing — being outside its own
 * time is what it is. Reaching the present is the loss.
 */
export interface Anomaly {
  /** How far along the player's lived path it has come. */
  idx: number;
  born: number;
}

/** Lived steps the anomaly covers per tick: the consequence outruns its cause. */
const ANOMALY_SPEED = 3;

/** How long the gate takes to swallow the body, in ms: a moment, not a cutscene. */
const CAPTURE_MS = 850;

/** The body's inspiral into the gate, from the moment it touches the horizon. */
interface Capture {
  t: number;
  /** Where it entered, as a polar offset from the gate's centre. */
  r0: number;
  a0: number;
}

/** Ticks of immunity after a restart or a timeline edit before history is judged again. */
const PARADOX_GRACE = 5;

const COL_GHOST = 0x76d9ff;
const COL_ANOMALY = 0xff4d6d;
const COL_SPIKE = 0x93a2c4;
const COL_SPRING = 0x9be36a;

/** Minimum area (px²) of real overlap with a drawn spike that counts as touching it. */
const HAZARD_OVERLAP_MIN = 50;

/** Absolute area of a polygon via the shoelace formula. */
function polygonArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Clips a subject polygon to the half-plane on one side of a vertical/horizontal edge. */
function clipPlane(
  pts: { x: number; y: number }[],
  axis: 'x' | 'y',
  edge: number,
  keepGreater: boolean,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const inside = (p: { x: number; y: number }): boolean =>
    axis === 'x' ? (keepGreater ? p.x >= edge : p.x <= edge) : keepGreater ? p.y >= edge : p.y <= edge;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const nxt = pts[(i + 1) % pts.length];
    const curIn = inside(cur);
    const nxtIn = inside(nxt);
    if (curIn) out.push(cur);
    if (curIn !== nxtIn) {
      const t =
        axis === 'x' ? (edge - cur.x) / (nxt.x - cur.x) : (edge - cur.y) / (nxt.y - cur.y);
      out.push({ x: cur.x + t * (nxt.x - cur.x), y: cur.y + t * (nxt.y - cur.y) });
    }
  }
  return out;
}

/** Area of overlap between a rect and a convex polygon, by clipping the polygon to the rect. */
function rectPolygonOverlap(r: Rect, poly: { x: number; y: number }[]): number {
  let clipped = poly;
  clipped = clipPlane(clipped, 'x', r.x, true);
  clipped = clipPlane(clipped, 'x', r.x + r.w, false);
  clipped = clipPlane(clipped, 'y', r.y, true);
  clipped = clipPlane(clipped, 'y', r.y + r.h, false);
  return polygonArea(clipped);
}

/**
 * Total area (px²) of the player rect that overlaps the *drawn* spike image. The
 * visible spike is a run of 10px-wide triangles plus a 3px solid base bar, mirroring
 * drawHazards/drawHazardsInverted exactly: apex at the top for floor spikes, apex at
 * the bottom for ceiling spikes.
 */
function hazardOverlapArea(pr: Rect, h: Rect, inverted: boolean): number {
  let area = 0;
  const spikes = Math.floor(h.w / 10);
  for (let i = 0; i < spikes; i++) {
    const x = h.x + i * 10;
    const tri = inverted
      ? [
        { x, y: h.y },
        { x: x + 5, y: h.y + h.h },
        { x: x + 10, y: h.y },
      ]
      : [
        { x, y: h.y + h.h },
        { x: x + 5, y: h.y },
        { x: x + 10, y: h.y + h.h },
      ];
    area += rectPolygonOverlap(pr, tri);
  }
  // The solid base bar, 3px thick.
  area += rectPolygonOverlap(
    pr,
    inverted
      ? [
        { x: h.x, y: h.y },
        { x: h.x + h.w, y: h.y },
        { x: h.x + h.w, y: h.y + 3 },
        { x: h.x, y: h.y + 3 },
      ]
      : [
        { x: h.x, y: h.y + h.h - 3 },
        { x: h.x + h.w, y: h.y + h.h - 3 },
        { x: h.x + h.w, y: h.y + h.h },
        { x: h.x, y: h.y + h.h },
      ],
  );
  return area;
}

export const VIEW_W = 960;
export const VIEW_H = 544;

export class GameScene extends Phaser.Scene {
  level!: LevelDef;
  world!: World;
  state: GameState = 'play';
  message = '';
  activeDevice: Device | null = null;
  anomalies: Anomaly[] = [];
  /** Every step the body has lived, in the order it lived them. */
  livedPath: LivedStep[] = [];
  lastParadoxReason = '';
  levelIndex = 0;
  /** A level being edited, played straight from the editor instead of the list. */
  draft: LevelDef | null = null;
  get hasNextLevel(): boolean {
    return this.draft === null && this.levelIndex + 1 < LEVELS.length;
  }

  private gfx!: Phaser.GameObjects.Graphics;
  private bg!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private jumpQueued = false;
  private acc = 0;
  private paradoxGrace = PARADOX_GRACE;
  private lastClast: Device | null = null;
  private effectT = 0;
  private fisheye: FisheyePipeline | null = null;
  private capture: Capture | null = null;
  private lastBeat = 0;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  /** When each spring last fired, so it can be drawn recoiling. */
  private springFired = new Map<string, number>();

  constructor() {
    super('game');
  }

  init(data: { level?: number; draft?: LevelDef | null }): void {
    if (typeof data.level === 'number') this.levelIndex = data.level;
    if (data.draft !== undefined) this.draft = data.draft;
  }

  create(): void {
    this.level = this.draft ?? buildLevel(this.levelIndex);
    if (this.draft === null) applyThemeForLevel(this.levelIndex);
    this.world = new World(
      this.level.map,
      this.level.spawn,
      this.level.boxes,
      this.level.devices.map((d) => d.rect),
      this.level.buttons ?? [],
      this.level.phase ?? [],
      this.level.springs ?? [],
    );
    this.state = 'play';
    this.message = '';
    this.anomalies = [];
    this.livedPath = [];
    this.acc = 0;
    this.effectT = 0;
    this.paradoxGrace = PARADOX_GRACE;
    this.jumpQueued = false;
    this.activeDevice = null;
    this.lastClast = null;
    this.capture = null;
    this.springFired = new Map();

    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4);
    if (!this.textures.exists('dust-px')) g.generateTexture('dust-px', 4, 4);
    g.destroy();

    this.cameras.main.setViewport(0, 0, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(COL_BG());
    this.cameras.main.setBounds(0, 0, this.level.map.widthPx, this.level.map.heightPx);
    this.cameras.main.setAlpha(1);
    this.cameras.main.setZoom(1);
    fadeIn(this);
    void music.init();
    void music.playLevel();
    this.followTarget.x = this.level.spawn.x;
    this.followTarget.y = this.level.spawn.y;
    this.cameras.main.startFollow(this.followTarget, true, 0.12, 0.12);

    this.bg = this.add.graphics().setScrollFactor(0.25).setDepth(-10);
    this.drawBackdrop();
    this.gfx = this.add.graphics().setDepth(0);
    this.vignette = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.drawVignette();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys(
      'LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,R,K,M,ESC,ENTER',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => (this.jumpQueued = true));
    kb.on('keydown-UP', () => (this.jumpQueued = true));
    kb.on('keydown-W', () => (this.jumpQueued = true));
    kb.on('keydown-R', () => this.onReversePressed());
    kb.on('keydown-K', () => this.abandonRun());
    kb.on('keydown-M', () => sfx.toggleMute());
    kb.on('keydown', () => sfx.unlock());
    this.input.on('pointerdown', () => sfx.unlock());
    kb.on('keydown-ESC', () => this.openMenu());
    kb.on('keydown-ENTER', () => {
      if (this.state !== 'won' || !this.captureDone) return;
      if (this.draft || !this.hasNextLevel) {
        this.openMenu();
        return;
      }
      fadeOutThen(this, 220, () => this.scene.restart({ level: this.levelIndex + 1 }));
    });

    if (!this.scene.isActive('hud')) this.scene.launch('hud');

    const renderer = this.game.renderer;
    if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      if (!renderer.pipelines.getPostPipeline(FISHEYE_KEY)) {
        renderer.pipelines.addPostPipeline(FISHEYE_KEY, FisheyePipeline);
      }
      this.cameras.main.setPostPipeline(FISHEYE_KEY);
      this.fisheye = this.cameras.main.getPostPipeline(FISHEYE_KEY) as FisheyePipeline;
      if (this.fisheye) {
        this.fisheye.amount = 0;
        this.fisheye.chroma = 0;
        this.fisheye.swirl = 3;
        this.fisheye.centreX = 0.5;
        this.fisheye.centreY = 0.5;
        this.fisheye.aspect = 1;
      }
    }
  }

  // ---------------------------------------------------------------- input

  private readInput(): Input {
    const k = this.keys;
    const left = k.LEFT.isDown || k.A.isDown;
    const right = k.RIGHT.isDown || k.D.isDown;
    const down = k.DOWN.isDown || k.S.isDown;
    const jump = k.UP.isDown || k.W.isDown || k.SPACE.isDown;
    return { left, right, down, jump, jumpPressed: this.jumpQueued };
  }

  private onReversePressed(): void {
    if (this.state === 'won' || this.state === 'dust' || this.state === 'fisheye') return;
    if (this.activeDevice?.kind !== 'anachroverter') return;
    this.world.dir = this.world.dir === 1 ? -1 : 1;
    this.message = `TIME DIRECTION: ${this.world.dir === 1 ? 'FORWARD' : 'BACKWARD'}`;
    sfx.reverse();
  }

  /** Back to wherever this run came from: the editor for a draft, the list otherwise. */
  openMenu(): void {
    const draft = this.draft;
    music.stopLevel();
    fadeOutThen(this, 200, () => {
      this.scene.stop('hud');
      if (draft) this.scene.start('editor');
      else this.scene.start('menu');
    });
  }

  /** The way out of a run that cannot be finished: a level can be walled off with
     * every pad on the far side of the stone, and history is only worth keeping if
     * abandoning it is cheap.
     */
  abandonRun(): void {
    if (this.state === 'play') this.fail('death', 'RUN ABANDONED');
    else fadeOutThen(this, 200, () => this.scene.restart({ level: this.levelIndex, draft: this.draft }));
  }

  /** Called by the HUD while the player scrubs the slider on a chronoporter. */
  scrub(t: number): void {
    if (!this.canScrub()) return;
    if (t !== this.world.now) sfx.scrubTick();
    this.world.scrubTo(t);
    music.pauseLevel();
    music.seekLevel(t);
  }

  canScrub(): boolean {
    // Only the chronoporter repositions the world in time; the anachroverter
    // changes the sign of time progression.
    return this.state === 'play' && this.activeDevice?.kind === 'chronoporter';
  }

  // ---------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    if (this.state !== 'play') {
      this.runFailEffects(delta);
      this.render();
      return;
    }

    const input = this.readInput();
    this.updateDevice();

    this.acc += Math.min(delta, 50);
    const stepMs = 1000 / 60;
    let steps = 0;
    while (this.acc >= stepMs && steps < 5 && this.state === 'play') {
      this.acc -= stepMs;
      steps++;
      this.tick(steps === 1 ? input : { ...input, jumpPressed: false });
      // Only drop a buffered jump once a tick has actually consumed it.
      this.jumpQueued = false;
    }

    this.followTarget.x = this.world.player.x + 10;
    this.followTarget.y = this.world.player.y + 14;
    this.beatForAnomalies();
    // Sync level music to the current timeline tick, or freeze it in
    // place while time itself is paused.
    if (this.world.paused) {
      music.pauseLevel();
    } else {
      music.resumeLevel();
      music.seekLevel(this.world.now);
    }
    this.render();
  }

  /** A heartbeat while an anomaly is on your path, quicker the closer it is. */
  private beatForAnomalies(): void {
    const lead = this.anomalyLead();
    if (lead === null) return;
    const period = 260 + Math.min(lead, 300) * 2.2;
    if (this.time.now - this.lastBeat < period) return;
    this.lastBeat = this.time.now;
    sfx.anomalyBeat();
  }

  private followTarget = { x: 0, y: 0 };

  private tick(input: Input): void {
    const world = this.world;
    const before = {
      grounded: world.player.groundedOn !== GROUND_NONE,
      boxX: world.boxes.map((b) => b.state.x),
      stoneV: world.boxes.map((b) => b.state.vy),
    };
    this.tickBody(input);
    this.soundFor(before);
  }

  /** Whatever the tick did that is worth hearing. */
  private soundFor(before: { grounded: boolean; boxX: number[]; stoneV: number[] }): void {
    const world = this.world;
    const p = world.player;
    const grounded = p.groundedOn !== GROUND_NONE;
    if (before.grounded && !grounded && p.vy < -100) sfx.jump();
    else if (!before.grounded && grounded) sfx.land();
    world.boxes.forEach((b, i) => {
      if (b.immovable) {
        if (before.stoneV[i] > 300 && b.state.vy === 0) sfx.impact();
      } else if (Math.abs(b.state.x - before.boxX[i]) > 0.4 && grounded) {
        sfx.push();
      }
    });
  }

  /** A spring that fired this tick: remembered for the recoil, and heard. */
  private noteSpring(): void {
    const sp = this.world.sprungOn;
    if (!sp) return;
    this.springFired.set(`${sp.x},${sp.y}`, this.time.now);
    sfx.spring();
  }

  private tickBody(input: Input): void {
    const world = this.world;
    if (world.paused) {
      // Timeline frozen on a device: the live body still moves, history does not.
      world.stepPlayerFrozen(input);
      this.noteSpring();
      // Time is standing still, but the body is still living steps, so an anomaly
      // retracing them still gains: waiting on a pad is not a hiding place.
      this.recordLivedStep();
      this.advanceAnomalies();
      if (this.anomalies.some((a) => a.idx >= this.livedPath.length - 1)) {
        this.fail('fisheye', 'ANOMALY CAUGHT UP');
      }
      return;
    }

    world.step(input);
    this.noteSpring();
    if (this.paradoxGrace > 0) this.paradoxGrace--;

    this.recordLivedStep();
    this.advanceAnomalies();

    if (this.paradoxGrace === 0) {
      const paradox = world.detectParadox();
      if (paradox) {
        this.paradoxGrace = PARADOX_GRACE;
        this.lastParadoxReason = paradox.reason;
        this.spawnAnomaly(paradox.run.id, paradox.tick);
        world.removeRun(paradox.run);
        sfx.paradox();
        this.message = `PARADOX — ${paradox.reason.toUpperCase()}`;
      }
    }

    const pr = playerRect(world.player);
    // Being shoved further than your own width means something closed on you.
    if (world.crushed) return this.fail('death', 'CRUSHED');
    for (const h of this.level.hazards) {
      if (hazardOverlapArea(pr, h, false) >= HAZARD_OVERLAP_MIN) return this.fail('death', 'KILLED BY HAZARD');
    }
    for (const h of this.level.hazardsInverted) {
      if (hazardOverlapArea(pr, h, true) >= HAZARD_OVERLAP_MIN) return this.fail('death', 'KILLED BY HAZARD');
    }
    for (const box of world.boxes) {
      const br = boxRect(box);
      const crushed = rectsOverlap(pr, { x: br.x + 3, y: br.y + 3, w: br.w - 6, h: br.h - 6 });
      if (crushed) return this.fail('death', 'CRUSHED');
    }
    // The anomaly catches you by reaching your present, not by touching you.
    if (this.anomalies.some((a) => a.idx >= this.livedPath.length - 1)) {
      return this.fail('fisheye', 'ANOMALY CAUGHT UP');
    }
    const ex = this.level.exit;
    if (rectsOverlap(pr, { x: ex.x - ex.r, y: ex.y - ex.r, w: ex.r * 2, h: ex.r * 2 })) {
      this.state = 'won';
      this.message = 'TIMELINE RESOLVED';
      music.stopLevel();
      if (this.draft === null) markLevelComplete(this.levelIndex);
      this.beginCapture();
      return;
    }
    if (world.atTimeBound()) {
      this.fail('dust', world.now <= 0 ? 'REACHED THE BEGINNING OF TIME' : 'REACHED THE END OF TIME');
    }
  }

  private updateDevice(): void {
    const world = this.world;
    const pr = playerRect(world.player);
    const grounded = world.player.groundedOn !== -2;
    const found = grounded ? this.level.devices.find((d) => rectsOverlap(pr, d.rect)) ?? null : null;

    if (found?.kind === 'chronoclast') {
      if (this.lastClast !== found) {
        this.lastClast = found;
        world.erasePlayerHistory();
        this.anomalies = [];
        this.livedPath = [];
        this.paradoxGrace = PARADOX_GRACE;
        this.message = 'CHRONOCLAST — RECORDED HISTORY ERASED';
      }
    } else {
      this.lastClast = null;
    }

    const pausing = found?.kind === 'chronoporter' || found?.kind === 'anachroverter';
    if (pausing && this.activeDevice !== found) {
      this.activeDevice = found;
      world.paused = true;
      this.message = '';
      sfx.device();
    } else if (!pausing && this.activeDevice) {
      // Stepping off a pausing pad always closes the recording segment: the body
      // moved while the timeline stood still, so what follows is a new worldline.
      world.splitRun();
      this.paradoxGrace = PARADOX_GRACE;
      this.activeDevice = null;
      world.paused = false;
      this.message = `TIME RESUMES ${world.dir === 1 ? 'FORWARD' : 'BACKWARD'}`;
    } else if (!pausing) {
      world.paused = false;
    }
  }

  private recordLivedStep(): void {
    const p = this.world.player;
    this.livedPath.push({ ...p, tick: this.world.now, runId: this.world.current.id });
  }

  /**
   * The anomaly sets off from the moment the physics went invalid — the lived step
   * at which the contradicted run occupied the contradicted tick — and gains on the
   * present from there.
   */
  private spawnAnomaly(runId: number, tick: number): void {
    const at = this.livedPath.findIndex((s) => s.runId === runId && s.tick === tick);
    const fallback = this.livedPath.findIndex((s) => s.runId === runId);
    this.anomalies.push({ idx: Math.max(0, at >= 0 ? at : fallback), born: this.time.now });
  }

  private advanceAnomalies(): void {
    for (const a of this.anomalies) {
      a.idx = Math.min(a.idx + ANOMALY_SPEED, this.livedPath.length - 1);
    }
  }

  /** How the pad underfoot is worked, for as long as the body is stood on it. */
  deviceHint(): string | null {
    const d = this.activeDevice;
    if (!d) return null;
    return d.kind === 'anachroverter' ? `${d.label} — press [R] to reverse time` : `${d.label} — drag the slider to advance time`;
  }

  /** Lived steps between the nearest anomaly and the present, or null if there is none. */
  anomalyLead(): number | null {
    if (this.anomalies.length === 0) return null;
    const closest = Math.max(...this.anomalies.map((a) => a.idx));
    return Math.max(0, this.livedPath.length - 1 - closest);
  }

  anomalySteps(): LivedStep[] {
    return this.anomalies.map((a) => this.livedPath[a.idx]).filter((s): s is LivedStep => !!s);
  }

  /** The timeline tick each anomaly currently occupies, for HUD markers. */
  anomalyTimelineTicks(): number[] {
    return this.anomalies
      .map((a) => this.livedPath[a.idx])
      .filter((s): s is LivedStep => !!s)
      .map((s) => s.tick);
  }

  // ---------------------------------------------------------------- fails

  private fail(kind: 'death' | 'dust' | 'fisheye', why: string): void {
    if (this.state !== 'play') return;
    this.state = kind;
    this.message = why;
    music.stopLevel();
    this.effectT = 0;
    this.cameras.main.stopFollow();
    if (kind === 'dust') {
      this.emitDust();
      sfx.dust();
    }
    if (kind === 'death') {
      this.emitDust(this.world.player.x, this.world.player.y, 60);
      sfx.death();
    }
    if (kind === 'fisheye') sfx.collapse();
  }

  private emitDust(x?: number, y?: number, count = 700): void {
    const cam = this.cameras.main;
    const area =
      x === undefined || y === undefined
        ? new Phaser.Geom.Rectangle(cam.scrollX, cam.scrollY, VIEW_W, VIEW_H)
        : new Phaser.Geom.Rectangle(x - 12, y - 14, 24, 28);
    const player = COL_PLAYER();
    const tileEdge = COL_TILE_EDGE();
    this.dust = this.add.particles(0, 0, 'dust-px', {
      emitZone: { type: 'random', source: area, quantity: count },
      quantity: count,
      lifespan: { min: 700, max: 2000 },
      speedX: { min: -40, max: 40 },
      speedY: { min: -90, max: 20 },
      gravityY: 60,
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [player, COL_GHOST, tileEdge, 0xffffff],
      blendMode: 'ADD',
      emitting: false,
    });
    this.dust.explode(count);
  }

  // ---------------------------------------------------------------- the gate

  private beginCapture(): void {
    const e = this.level.exit;
    const p = this.world.player;
    const dx = p.x + PLAYER_W / 2 - e.x;
    const dy = p.y + PLAYER_H / 2 - e.y;
    this.capture = { t: 0, r0: Math.max(18, Math.hypot(dx, dy)), a0: Math.atan2(dy, dx) };
    sfx.capture();
    this.effectT = 0;
    this.cameras.main.stopFollow();
  }

  /** True once the gate has finished swallowing the body. */
  get captureDone(): boolean {
    return this.capture === null || this.capture.t >= CAPTURE_MS;
  }

  /**
   * The fall in: the body is drawn towards the gate and shrinks away to nothing,
   * a little quicker than linearly so the last of it goes suddenly.
   */
  private captureFrame(): { x: number; y: number; scale: number; k: number } {
    const c = this.capture!;
    const e = this.level.exit;
    const k = clamp(c.t / CAPTURE_MS, 0, 1);
    const r = c.r0 * Math.pow(1 - k, 1.6);
    const angle = c.a0 + k * 1.6;
    return {
      x: e.x + Math.cos(angle) * r,
      y: e.y + Math.sin(angle) * r,
      scale: Math.pow(1 - k, 1.3),
      k,
    };
  }

  private runFailEffects(delta: number): void {
    this.effectT += delta;
    if (this.state === 'won' && this.capture) {
      this.capture.t += delta;
      const { k } = this.captureFrame();
      const cam = this.cameras.main;
      cam.scrollX += (this.level.exit.x - VIEW_W / 2 - cam.scrollX) * 0.06;
      cam.scrollY += (this.level.exit.y - VIEW_H / 2 - cam.scrollY) * 0.06;
      cam.setZoom(1 + k * 0.1);
      // The lensing is centred on the gate itself, not the middle of the screen.
      if (this.fisheye) {
        const e = this.level.exit;
        this.fisheye.aspect = VIEW_W / VIEW_H;
        this.fisheye.centreX = clamp((e.x - cam.scrollX) / VIEW_W, 0, 1);
        this.fisheye.centreY = clamp(1 - (e.y - cam.scrollY) / VIEW_H, 0, 1);
        this.fisheye.swirl = 0.6;
        this.fisheye.amount = Math.pow(k, 0.8) * 0.34;
        this.fisheye.chroma = k * 0.3;
      }
    }
    if (this.state === 'fisheye' && this.fisheye) {
      const k = clamp(this.effectT / 1400, 0, 1);
      this.fisheye.amount = k * 0.85;
      this.fisheye.chroma = k;
      this.cameras.main.setZoom(1 + k * 0.35);
      this.cameras.main.shake(16, 0.002 + k * 0.004);
    }
    if (this.state === 'dust') {
      this.cameras.main.setAlpha(clamp(1 - this.effectT / 2200, 0, 1));
    }
    if (this.state !== 'won' && this.effectT > (this.state === 'death' ? 1100 : 2100)) {
      fadeOutThen(this, 240, () => this.scene.restart({ level: this.levelIndex, draft: this.draft }));
    }
  }

  // ---------------------------------------------------------------- render

  /** Corners pulled down, so the eye sits in the middle of the run. */
  private drawVignette(): void {
    const g = this.vignette;
    g.clear();
    const vignette = COL_VIGNETTE();
    for (let i = 0; i < 22; i++) {
      const k = i / 22;
      g.lineStyle(6, vignette, 0.035 + k * 0.05);
      g.strokeRect(3 * i, 3 * i, VIEW_W - 6 * i, VIEW_H - 6 * i);
    }
  }

  private drawBackdrop(): void {
    const g = this.bg;
    g.clear();
    const nebulaColors = NEBULA_COLORS();
    // A little depth behind the stars: slow, dim clouds of nothing much.
    for (let i = 0; i < 5; i++) {
      const x = 200 + i * 430;
      const y = 90 + (i % 3) * 150;
      for (let r = 6; r >= 1; r--) {
        g.fillStyle(nebulaColors[i % nebulaColors.length], 0.02);
        g.fillCircle(x, y, r * 26);
      }
    }
    const tileEdge = COL_TILE_EDGE();
    const backdropFrame = COL_BACKDROP_FRAME();
    for (let i = 0; i < 90; i++) {
      const x = (i * 137) % (this.level.map.widthPx + 400);
      const y = (i * 271) % this.level.map.heightPx;
      const s = 1 + (i % 3);
      g.fillStyle(i % 5 === 0 ? tileEdge : backdropFrame, 0.9);
      g.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 6; i++) {
      g.lineStyle(2, backdropFrame, 0.9);
      g.strokeRect(120 + i * 260, 60 + (i % 3) * 90, 180, 120);
    }
  }

  private render(): void {
    const g = this.gfx;
    g.clear();
    this.drawTiles(g);
    this.drawPhaseBlocks(g);
    this.drawButtons(g);
    this.drawSprings(g);
    this.drawHazards(g);
    this.drawHazardsInverted(g);
    this.drawExit(g);
    for (const box of this.world.boxes) this.drawBox(g, box);
    this.drawDevices(g);
    for (const { state } of this.world.ghostsAt(this.world.now)) this.drawGhost(g, state);
    for (const s of this.anomalySteps()) this.drawAnomaly(g, s);
    if (this.state === 'won' && this.capture) this.drawCapturedBody(g);
    else if (this.state !== 'death' && this.state !== 'dust') this.drawPlayer(g);
  }

  private drawTiles(g: Phaser.GameObjects.Graphics): void {
    const map = this.level.map;
    const cam = this.cameras.main;
    const x0 = Math.max(0, Math.floor(cam.scrollX / TILE) - 1);
    const x1 = Math.min(map.cols - 1, Math.ceil((cam.scrollX + VIEW_W) / TILE));
    const tile = COL_TILE();
    const tileInner = COL_TILE_INNER();
    const tileEdge = COL_TILE_EDGE();
    for (let cy = 0; cy < map.rows; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!map.isSolid(cx, cy)) continue;
        const x = cx * TILE;
        const y = cy * TILE;
        g.fillStyle(tile, 1).fillRect(x, y, TILE, TILE);
        g.fillStyle(tileInner, 1).fillRect(x + 2, y + 6, TILE - 4, TILE - 8);
        if (!map.isSolid(cx, cy - 1)) g.fillStyle(tileEdge, 1).fillRect(x, y, TILE, 4);
      }
    }
  }

  /**
   * A block in one of its two forms: filled and edged while solid, a dim dashed
   * outline while it is only the memory of a wall. It wears the colour of the
   * button that works it, so which button opens which way through is read off the
   * screen rather than remembered.
   */
  private drawPhaseBlocks(g: Phaser.GameObjects.Graphics): void {
    for (const p of this.world.phase) {
      const r = p.rect;
      const c = groupColour(p.group);
      if (this.world.isSolidPhase(p)) {
        g.fillStyle(shade(c, 0.6), 1).fillRect(r.x, r.y, r.w, r.h);
        g.fillStyle(c, 1).fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
        g.lineStyle(1, tint(c, 0.6), 0.5).strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      } else {
        g.fillStyle(c, 0.07).fillRect(r.x, r.y, r.w, r.h);
        g.lineStyle(1, c, 0.45);
        for (let x = r.x + 3; x < r.x + r.w; x += 8) g.lineBetween(x, r.y + 1, x, r.y + 4);
        for (let x = r.x + 3; x < r.x + r.w; x += 8) g.lineBetween(x, r.y + r.h - 4, x, r.y + r.h - 1);
        for (let y = r.y + 3; y < r.y + r.h; y += 8) g.lineBetween(r.x + 1, y, r.x + 4, y);
        for (let y = r.y + 3; y < r.y + r.h; y += 8) g.lineBetween(r.x + r.w - 4, y, r.x + r.w - 1, y);
      }
    }
  }

  /**
   * A plate in a socket that sinks while it is held down. Deliberately squat and
   * mechanical: a device is a tall lit volume you stand inside, and nothing about
   * a button should read that way.
   */
  private drawButtons(g: Phaser.GameObjects.Graphics): void {
    for (const b of this.world.buttons) {
      const r = b.rect;
      const c = groupColour(b.group);
      const down = this.world.isPressed(b.group);
      const lift = down ? 2 : 6;
      const top = r.y + r.h - lift;
      // The socket it sits in, wider than the plate and dark.
      g.fillStyle(0x120c26, 1).fillRect(r.x - 2, r.y + r.h - 4, r.w + 4, 4);
      g.fillStyle(shade(c, 0.7), 1).fillRect(r.x - 2, r.y + r.h - 4, r.w + 4, 1);
      // The plate, and the shoulders it rides between.
      g.fillStyle(down ? tint(c, 0.35) : c, down ? 1 : 0.85).fillRect(r.x + 3, top, r.w - 6, lift - 1);
      g.fillStyle(shade(c, 0.55), 1).fillRect(r.x + 1, r.y + r.h - 7, 2, 7);
      g.fillStyle(shade(c, 0.55), 1).fillRect(r.x + r.w - 3, r.y + r.h - 7, 2, 7);
      if (down) g.fillStyle(c, 0.35).fillRect(r.x + 3, top - 1, r.w - 6, 1);
    }
  }

  /**
   * A spring: a coil under a plate, squashed flat for a moment after it fires and
   * springing back over the next fraction of a second.
   */
  private drawSprings(g: Phaser.GameObjects.Graphics): void {
    for (const sp of this.level.springs ?? []) {
      const fired = this.springFired.get(`${sp.x},${sp.y}`);
      const since = fired === undefined ? Infinity : this.time.now - fired;
      // Flat at the moment of firing, back to full height a fifth of a second later.
      const k = Math.min(1, since / 200);
      const squash = 1 - 0.65 * (1 - k) * (1 - k);
      const h = sp.h * squash;
      const top = sp.y + sp.h - h;
      g.fillStyle(0x120c26, 1).fillRect(sp.x, sp.y + sp.h - 3, sp.w, 3);
      g.lineStyle(2, COL_SPRING, 0.85);
      const coils = 3;
      for (let i = 0; i < coils; i++) {
        const y = top + 2 + ((h - 4) / coils) * i;
        g.lineBetween(sp.x + 3, y, sp.x + sp.w - 3, y + (h - 4) / coils / 2);
        g.lineBetween(sp.x + sp.w - 3, y + (h - 4) / coils / 2, sp.x + 3, y + (h - 4) / coils);
      }
      g.fillStyle(COL_SPRING, 1).fillRect(sp.x, top, sp.w, 3);
      g.fillStyle(tint(COL_SPRING, 0.5), 0.9).fillRect(sp.x, top, sp.w, 1);
      if (k < 1) g.fillStyle(COL_SPRING, 0.25 * (1 - k)).fillRect(sp.x - 2, top - 10 * (1 - k), sp.w + 4, 10);
    }
  }

  private drawHazards(g: Phaser.GameObjects.Graphics): void {
    for (const h of this.level.hazards) {
      const spikes = Math.floor(h.w / 10);
      for (let i = 0; i < spikes; i++) {
        const x = h.x + i * 10;
        g.fillStyle(COL_SPIKE, 1);
        g.fillTriangle(x, h.y + h.h, x + 5, h.y, x + 10, h.y + h.h);
      }
      g.fillStyle(0x3a4568, 1).fillRect(h.x, h.y + h.h - 3, h.w, 3);
    }
  }

  private drawHazardsInverted(g: Phaser.GameObjects.Graphics): void {
    for (const h of this.level.hazardsInverted) {
      const spikes = Math.floor(h.w / 10);
      for (let i = 0; i < spikes; i++) {
        const x = h.x + i * 10;
        g.fillStyle(COL_SPIKE, 1);
        g.fillTriangle(x, h.y, x + 5, h.y + h.h, x + 10, h.y);
      }
      g.fillStyle(0x3a4568, 1).fillRect(h.x, h.y, h.w, 3);
    }
  }

  private drawExit(g: Phaser.GameObjects.Graphics): void {
    const e = this.level.exit;
    const t = this.time.now / 1000;
    const modalBg = COL_MODAL_BG();
    for (let i = 6; i >= 1; i--) {
      const r = e.r + i * 5;
      g.lineStyle(2, i % 2 === 0 ? 0x8b5cf6 : 0x38bdf8, 0.09 * i);
      g.beginPath();
      g.arc(e.x, e.y, r, t * (0.9 + i * 0.2), t * (0.9 + i * 0.2) + 4.4);
      g.strokePath();
    }
    g.fillStyle(0xd6b3ff, 0.35).fillCircle(e.x, e.y, e.r * 0.92);
    g.fillStyle(modalBg, 1).fillCircle(e.x, e.y, e.r * 0.72);
  }

  /**
   * The ground a suspended stone will come to rest on, so the warning marks stop
   * where the stone stops instead of running off the level.
   */
  private restRowUnder(r: Rect): number {
    const map = this.level.map;
    const cx0 = Math.floor(r.x / TILE);
    const cx1 = Math.floor((r.x + r.w - 1) / TILE);
    for (let cy = Math.floor((r.y + r.h) / TILE); cy < map.rows; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) if (map.isSolid(cx, cy)) return cy * TILE;
    }
    return map.heightPx;
  }

  /**
   * Where a held stone is going to fall: a dim shaded column and a hatched
   * landing footprint rather than beams, so it reads as a marked-off space.
   */
  private drawDropCorridor(g: Phaser.GameObjects.Graphics, r: Rect): void {
    const floorY = this.restRowUnder(r);
    const top = r.y + r.h;
    const h = floorY - top;
    if (h <= 0) return;
    const breathe = 0.06 + 0.03 * Math.sin(this.time.now / 700);
    g.fillStyle(COL_ANOMALY, breathe).fillRect(r.x, top, r.w, h);
    g.fillStyle(COL_ANOMALY, breathe * 1.6).fillRect(r.x, floorY - r.h, r.w, r.h);
    // Diagonal hatching across the footprint.
    g.lineStyle(1, COL_ANOMALY, 0.22);
    for (let x = r.x - r.h; x < r.x + r.w; x += 12) {
      const x0 = Math.max(r.x, x);
      const y0 = floorY - r.h + (x0 - x);
      const x1 = Math.min(r.x + r.w, x + r.h);
      const y1 = floorY - (x + r.h - x1);
      if (x1 > x0) g.lineBetween(x0, y0, x1, y1);
    }
    g.lineStyle(1, COL_ANOMALY, 0.3);
    g.lineBetween(r.x, floorY - r.h, r.x + r.w, floorY - r.h);
  }

  /** Stone that history hangs on: suspended until its tick, then immovable. */
  private drawMonolith(g: Phaser.GameObjects.Graphics, box: Box): void {
    const r = boxRect(box);
    const held = this.world.now < box.releaseTick;
    if (held) this.drawDropCorridor(g, r);
    const tileInner = COL_TILE_INNER();
    g.fillStyle(COL_MONOLITH_FIXED, 1).fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(held ? COL_MONOLITH_INNER_FIXED : COL_MONOLITH_INNER_FIXED, 1).fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    g.lineStyle(2, COL_MONOLITH_EDGE_FIXED, held ? 0.5 : 0.85).strokeRect(r.x, r.y, r.w, r.h);
    g.lineStyle(1, tileInner, 0.9);
    g.lineBetween(r.x + r.w * 0.3, r.y + 4, r.x + r.w * 0.45, r.y + r.h - 4);
    g.lineBetween(r.x + r.w * 0.7, r.y + 4, r.x + r.w * 0.58, r.y + r.h - 4);
    g.lineBetween(r.x + 4, r.y + r.h * 0.55, r.x + r.w - 4, r.y + r.h * 0.42);
  }

  private drawBox(g: Phaser.GameObjects.Graphics, box: Box): void {
    if (box.immovable) return this.drawMonolith(g, box);
    const r = boxRect(box);
    const rewinding = this.world.dir === -1 && !this.world.paused;
    g.fillStyle(COL_BOX_STRIPE_FIXED, 1).fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(COL_BOX_FIXED, 1).fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    g.fillStyle(COL_BOX_STRIPE_FIXED, 1).fillRect(r.x + 6, r.y + r.h / 2 - 2, r.w - 12, 4);
    if (rewinding) {
      g.lineStyle(2, COL_GHOST, 0.9).strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    } else if (this.world.paused) {
      g.lineStyle(2, 0xffffff, 0.45).strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    }
  }

  private drawDevices(g: Phaser.GameObjects.Graphics): void {
    const t = this.time.now / 300;
    for (const d of this.level.devices) {
      const r = d.rect;
      const color =
        d.kind === 'chronoporter' ? 0x38bdf8 : d.kind === 'anachroverter' ? 0xa855f7 : 0xf43f5e;
      const pulse = 0.25 + 0.2 * Math.sin(t + r.x);
      // The volume the body stands in: a field, drawn behind the player.
      g.fillStyle(color, 0.1 + 0.06 * pulse).fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(1, color, 0.5).strokeRect(r.x, r.y, r.w, r.h);
      // The plate underfoot.
      const base = r.y + r.h - 10;
      g.fillStyle(0x120c26, 1).fillRect(r.x, base, r.w, 10);
      g.fillStyle(color, 1).fillRect(r.x + 2, base + 2, r.w - 4, 6);
      g.fillStyle(color, pulse).fillRect(r.x + 4, r.y + 2, r.w - 8, 3);
    }
  }

  private drawBody(
    g: Phaser.GameObjects.Graphics,
    s: { x: number; y: number; facing: 1 | -1; ducking: boolean },
    color: number,
    alpha: number,
  ): void {
    const r = playerRect(s);
    g.fillStyle(color, alpha).fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(0x000000, alpha * 0.55).fillRect(r.x + 3, r.y + 4, r.w - 6, 6);
    const eyeX = s.facing === 1 ? r.x + r.w - 8 : r.x + 3;
    g.fillStyle(0xffffff, alpha).fillRect(eyeX, r.y + 6, 5, 3);
    g.fillStyle(0x000000, alpha * 0.35).fillRect(r.x, r.y + r.h - 4, r.w, 4);
  }

  private drawPlayer(g: Phaser.GameObjects.Graphics): void {
    const p = this.world.player;
    const r = playerRect(p);
    const player = COL_PLAYER();
    // Where the body meets the floor, so a jump reads as height.
    const floorY = this.restRowUnder(r);
    const drop = clamp((floorY - (r.y + r.h)) / 140, 0, 1);
    if (floorY < this.level.map.heightPx) {
      g.fillStyle(COL_MODAL_BG(), 0.4 * (1 - drop));
      g.fillEllipse(r.x + r.w / 2, floorY + 1, r.w * (1.1 - drop * 0.5), 6);
    }
    this.drawBody(g, p, player, 1);
  }

  /** The body on its way in: the same body, drawn smaller and dimmer each frame. */
  private drawCapturedBody(g: Phaser.GameObjects.Graphics): void {
    const f = this.captureFrame();
    const w = PLAYER_W * f.scale;
    const h = PLAYER_H * f.scale;
    const player = COL_PLAYER();
    g.fillStyle(mixColor(player, COL_ANOMALY, f.k), 1 - f.k * 0.3);
    g.fillRect(f.x - w / 2, f.y - h / 2, w, h);
    // The gate answers: the ring tightens and the throat brightens as it takes it.
    const e = this.level.exit;
    g.lineStyle(2, 0xd6b3ff, 0.5 * (1 - f.k)).strokeCircle(e.x, e.y, e.r * (1.5 - 0.6 * f.k));
    g.fillStyle(0xffffff, 0.3 * f.k * f.k).fillCircle(e.x, e.y, e.r * 0.6);
  }

  private drawGhost(g: Phaser.GameObjects.Graphics, s: PlayerState): void {
    this.drawBody(g, s, COL_GHOST, 0.42);
    const r = playerRect(s);
    g.lineStyle(1, COL_GHOST, 0.55).strokeRect(r.x, r.y, r.w, r.h);
  }

  /**
   * An anomaly is a ghost out of its time: the same translucent body as any other
   * former self, pulsing red, with nothing solid about it. The pulse is the whole
   * warning — how close it is is read off the HUD.
   */
  private drawAnomaly(g: Phaser.GameObjects.Graphics, s: LivedStep): void {
    const lead = this.anomalyLead() ?? 0;
    const urgency = 1 - Math.min(1, lead / 240);
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / (150 - urgency * 90));
    this.drawBody(g, s, COL_ANOMALY, 0.3 + 0.35 * pulse);
    const r = playerRect(s);
    g.lineStyle(1, COL_ANOMALY, 0.35 + 0.5 * pulse).strokeRect(r.x, r.y, r.w, r.h);
    // A displaced tick reads as a rip rather than a body: the outline is doubled,
    // offset by the distance it is out of time.
    const slip = 2 + 3 * pulse;
    g.lineStyle(1, COL_ANOMALY, 0.18 + 0.22 * pulse).strokeRect(r.x - slip, r.y + slip, r.w, r.h);
    g.lineStyle(1, COL_GHOST, 0.12 + 0.2 * pulse).strokeRect(r.x + slip, r.y - slip, r.w, r.h);
    this.drawFizzle(g, r, urgency);
  }

  /**
   * The body coming apart: it is being held in a time that is not its own, so it
   * tears into scanlines and throws off sparks, harder the closer it gets.
   */
  private drawFizzle(g: Phaser.GameObjects.Graphics, r: Rect, urgency: number): void {
    const t = this.time.now;
    const rand = (n: number): number => {
      const v = Math.sin(n * 12.9898 + Math.floor(t / 55) * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    // Slices of the body slid sideways, as if its history were mistracking.
    const slices = 3 + Math.round(urgency * 3);
    for (let i = 0; i < slices; i++) {
      const y = r.y + rand(i) * (r.h - 3);
      const h = 1 + rand(i + 40) * 2;
      const dx = (rand(i + 80) - 0.5) * (6 + urgency * 10);
      g.fillStyle(rand(i + 120) > 0.5 ? COL_ANOMALY : COL_GHOST, 0.35 + 0.4 * urgency);
      g.fillRect(r.x + dx, y, r.w, h);
    }
    // Sparks shed into the space around it, drifting up out of the tear.
    const sparks = 5 + Math.round(urgency * 7);
    for (let i = 0; i < sparks; i++) {
      const life = ((t / 380 + rand(i + 200)) % 1);
      const x = r.x + rand(i + 240) * r.w + (rand(i + 280) - 0.5) * 10;
      const y = r.y + r.h * rand(i + 320) - life * (10 + urgency * 16);
      const size = 1 + rand(i + 360) * 1.6;
      g.fillStyle(COL_ANOMALY, (1 - life) * (0.35 + 0.45 * urgency));
      g.fillRect(x, y, size, size);
    }
  }
}
