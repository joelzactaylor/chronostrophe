import Phaser from 'phaser';
import { PlayerState, Rect, TICKS, TILE, clamp, rectsOverlap } from '../core/types';
import { Box, Input, World, boxRect, playerRect } from '../core/world';
import { Device, LEVELS, LevelDef, buildLevel } from './level';
import { FISHEYE_KEY, FisheyePipeline } from './fisheye';

export type GameState = 'play' | 'death' | 'dust' | 'fisheye' | 'won';

export interface Singularity {
  path: PlayerState[];
  idx: number;
  x: number;
  y: number;
  homing: boolean;
  born: number;
  /** Ticks left of the fuse: the contradicted ghost burning in place before it moves. */
  fuse: number;
  ducking: boolean;
  facing: 1 | -1;
}

/** How long a contradicted ghost burns as a fuse ghost before it starts chasing. */
const FUSE_TICKS = 45;

/** Ticks of immunity after a restart or a timeline edit before history is judged again. */
const PARADOX_GRACE = 5;

const COL_BG = 0x0b0714;
const COL_TILE = 0x241a44;
const COL_TILE_EDGE = 0x6d4bd6;
const COL_PLAYER = 0xf7e26b;
const COL_GHOST = 0x76d9ff;
const COL_BOX = 0xd98b45;
const COL_SINGULARITY = 0xff4d6d;
const COL_SPIKE = 0x93a2c4;

export const VIEW_W = 960;
export const VIEW_H = 544;

export class GameScene extends Phaser.Scene {
  level!: LevelDef;
  world!: World;
  state: GameState = 'play';
  message = '';
  activeDevice: Device | null = null;
  singularities: Singularity[] = [];
  lastParadoxReason = '';
  levelIndex = 0;
  get hasNextLevel(): boolean {
    return this.levelIndex + 1 < LEVELS.length;
  }

  private gfx!: Phaser.GameObjects.Graphics;
  private bg!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private jumpQueued = false;
  private acc = 0;
  private paradoxGrace = PARADOX_GRACE;
  private lastClast: Device | null = null;
  private effectT = 0;
  private fisheye: FisheyePipeline | null = null;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor() {
    super('game');
  }

  init(data: { level?: number }): void {
    if (typeof data.level === 'number') this.levelIndex = data.level;
  }

  create(): void {
    this.level = buildLevel(this.levelIndex);
    this.world = new World(this.level.map, this.level.spawn, this.level.boxes);
    this.state = 'play';
    this.message = '';
    this.singularities = [];
    this.acc = 0;
    this.effectT = 0;
    this.paradoxGrace = PARADOX_GRACE;
    this.jumpQueued = false;
    this.activeDevice = null;
    this.lastClast = null;

    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 4);
    if (!this.textures.exists('dust-px')) g.generateTexture('dust-px', 4, 4);
    g.destroy();

    this.cameras.main.setViewport(0, 0, VIEW_W, VIEW_H);
    this.cameras.main.setBackgroundColor(COL_BG);
    this.cameras.main.setBounds(0, 0, this.level.map.widthPx, this.level.map.heightPx);
    this.cameras.main.setAlpha(1);
    this.cameras.main.setZoom(1);
    this.followTarget.x = this.level.spawn.x;
    this.followTarget.y = this.level.spawn.y;
    this.cameras.main.startFollow(this.followTarget, true, 0.12, 0.12);

    this.bg = this.add.graphics().setScrollFactor(0.25).setDepth(-10);
    this.drawBackdrop();
    this.gfx = this.add.graphics().setDepth(0);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys(
      'LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,R,ENTER',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => (this.jumpQueued = true));
    kb.on('keydown-UP', () => (this.jumpQueued = true));
    kb.on('keydown-W', () => (this.jumpQueued = true));
    kb.on('keydown-R', () => this.onReversePressed());
    kb.on('keydown-ENTER', () => {
      if (this.state !== 'won') return;
      this.scene.restart({ level: this.hasNextLevel ? this.levelIndex + 1 : 0 });
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
  }

  /** Called by the HUD while the player scrubs the slider on a chronoporter. */
  scrub(t: number): void {
    if (!this.canScrub()) return;
    this.world.scrubTo(t);
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
    this.render();
  }

  private followTarget = { x: 0, y: 0 };

  private tick(input: Input): void {
    const world = this.world;
    if (world.paused) {
      // Timeline frozen on a device: the live body still moves, history does not.
      world.stepPlayerFrozen(input);
      return;
    }

    world.step(input);
    if (this.paradoxGrace > 0) this.paradoxGrace--;

    this.advanceSingularities();

    if (this.paradoxGrace === 0) {
      const paradox = world.detectParadox();
      if (paradox) {
        this.paradoxGrace = PARADOX_GRACE;
        this.lastParadoxReason = paradox.reason;
        // The contradicted ghost is not a ghost any more: it becomes the fuse.
        this.spawnSingularity(paradox.tick, paradox.run.states, paradox.run.dir);
        world.removeRun(paradox.run);
        this.message = `PARADOX — ${paradox.reason.toUpperCase()}`;
      }
    }

    const pr = playerRect(world.player);
    // Being shoved further than your own width means something closed on you.
    if (world.crushed) return this.fail('death', 'CRUSHED');
    for (const h of this.level.hazards) {
      if (rectsOverlap(pr, h)) return this.fail('death', 'KILLED BY HAZARD');
    }
    for (const box of world.boxes) {
      const br = boxRect(box);
      const crushed = rectsOverlap(pr, { x: br.x + 3, y: br.y + 3, w: br.w - 6, h: br.h - 6 });
      if (crushed) return this.fail('death', 'CRUSHED');
    }
    for (const s of this.singularities) {
      if (s.fuse <= 0 && rectsOverlap(pr, { x: s.x, y: s.y, w: 20, h: 28 })) {
        return this.fail('fisheye', 'SINGULARITY CAPTURE');
      }
    }
    const ex = this.level.exit;
    if (rectsOverlap(pr, { x: ex.x - ex.r, y: ex.y - ex.r, w: ex.r * 2, h: ex.r * 2 })) {
      this.state = 'won';
      this.message = 'TIMELINE RESOLVED';
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
        this.singularities = [];
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
      this.message = found!.label;
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

  private spawnSingularity(tick: number, states: (PlayerState | undefined)[], runDir: 1 | -1): void {
    const path: PlayerState[] = [];
    for (let t = tick; t >= 0 && t <= TICKS; t += runDir) {
      const s = states[t];
      if (!s) break;
      path.push(s);
    }
    if (path.length < 1) return;
    this.singularities.push({
      path,
      idx: 0,
      x: path[0].x,
      y: path[0].y,
      homing: path.length < 2,
      born: this.time.now,
      fuse: FUSE_TICKS,
      ducking: path[0].ducking,
      facing: path[0].facing,
    });
  }

  private advanceSingularities(): void {
    const p = this.world.player;
    for (const s of this.singularities) {
      if (s.fuse > 0) {
        s.fuse--;
        continue;
      }
      if (!s.homing) {
        // Double speed: the consequence outruns the history that produced it.
        s.idx += 2;
        if (s.idx >= s.path.length) {
          s.homing = true;
        } else {
          s.x = s.path[s.idx].x;
          s.y = s.path[s.idx].y;
        }
      }
      if (s.homing) {
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = 3.1;
        s.x += (dx / len) * speed;
        s.y += (dy / len) * speed;
      }
    }
  }

  // ---------------------------------------------------------------- fails

  private fail(kind: 'death' | 'dust' | 'fisheye', why: string): void {
    if (this.state !== 'play') return;
    this.state = kind;
    this.message = why;
    this.effectT = 0;
    this.cameras.main.stopFollow();
    if (kind === 'dust') this.emitDust();
    if (kind === 'death') this.emitDust(this.world.player.x, this.world.player.y, 60);
  }

  private emitDust(x?: number, y?: number, count = 700): void {
    const cam = this.cameras.main;
    const area =
      x === undefined || y === undefined
        ? new Phaser.Geom.Rectangle(cam.scrollX, cam.scrollY, VIEW_W, VIEW_H)
        : new Phaser.Geom.Rectangle(x - 12, y - 14, 24, 28);
    this.dust = this.add.particles(0, 0, 'dust-px', {
      emitZone: { type: 'random', source: area, quantity: count },
      quantity: count,
      lifespan: { min: 700, max: 2000 },
      speedX: { min: -40, max: 40 },
      speedY: { min: -90, max: 20 },
      gravityY: 60,
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xf7e26b, 0x76d9ff, 0x6d4bd6, 0xffffff],
      blendMode: 'ADD',
      emitting: false,
    });
    this.dust.explode(count);
  }

  private runFailEffects(delta: number): void {
    this.effectT += delta;
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
      this.scene.restart({ level: this.levelIndex });
    }
  }

  // ---------------------------------------------------------------- render

  private drawBackdrop(): void {
    const g = this.bg;
    g.clear();
    for (let i = 0; i < 90; i++) {
      const x = (i * 137) % (this.level.map.widthPx + 400);
      const y = (i * 271) % this.level.map.heightPx;
      const s = 1 + (i % 3);
      g.fillStyle(i % 5 === 0 ? 0x6d4bd6 : 0x2b2350, 0.9);
      g.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 6; i++) {
      g.lineStyle(2, 0x1a1236, 0.9);
      g.strokeRect(120 + i * 260, 60 + (i % 3) * 90, 180, 120);
    }
  }

  private render(): void {
    const g = this.gfx;
    g.clear();
    this.drawTiles(g);
    this.drawHazards(g);
    this.drawExit(g);
    for (const box of this.world.boxes) this.drawBox(g, box);
    this.drawDevices(g);
    for (const { state } of this.world.ghostsAt(this.world.now)) this.drawGhost(g, state);
    for (const s of this.singularities) this.drawSingularity(g, s);
    if (this.state !== 'death' && this.state !== 'dust') this.drawPlayer(g);
  }

  private drawTiles(g: Phaser.GameObjects.Graphics): void {
    const map = this.level.map;
    const cam = this.cameras.main;
    const x0 = Math.max(0, Math.floor(cam.scrollX / TILE) - 1);
    const x1 = Math.min(map.cols - 1, Math.ceil((cam.scrollX + VIEW_W) / TILE));
    for (let cy = 0; cy < map.rows; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!map.isSolid(cx, cy)) continue;
        const x = cx * TILE;
        const y = cy * TILE;
        g.fillStyle(COL_TILE, 1).fillRect(x, y, TILE, TILE);
        g.fillStyle(0x1a1233, 1).fillRect(x + 2, y + 6, TILE - 4, TILE - 8);
        if (!map.isSolid(cx, cy - 1)) g.fillStyle(COL_TILE_EDGE, 1).fillRect(x, y, TILE, 4);
      }
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

  private drawExit(g: Phaser.GameObjects.Graphics): void {
    const e = this.level.exit;
    const t = this.time.now / 1000;
    for (let i = 6; i >= 1; i--) {
      const r = e.r + i * 5;
      g.lineStyle(2, i % 2 === 0 ? 0x8b5cf6 : 0x38bdf8, 0.09 * i);
      g.beginPath();
      g.arc(e.x, e.y, r, t * (0.9 + i * 0.2), t * (0.9 + i * 0.2) + 4.4);
      g.strokePath();
    }
    g.fillStyle(0xd6b3ff, 0.35).fillCircle(e.x, e.y, e.r * 0.92);
    g.fillStyle(0x05030a, 1).fillCircle(e.x, e.y, e.r * 0.72);
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
    g.fillStyle(COL_SINGULARITY, breathe).fillRect(r.x, top, r.w, h);
    g.fillStyle(COL_SINGULARITY, breathe * 1.6).fillRect(r.x, floorY - r.h, r.w, r.h);
    // Diagonal hatching across the footprint.
    g.lineStyle(1, COL_SINGULARITY, 0.22);
    for (let x = r.x - r.h; x < r.x + r.w; x += 12) {
      const x0 = Math.max(r.x, x);
      const y0 = floorY - r.h + (x0 - x);
      const x1 = Math.min(r.x + r.w, x + r.h);
      const y1 = floorY - (x + r.h - x1);
      if (x1 > x0) g.lineBetween(x0, y0, x1, y1);
    }
    g.lineStyle(1, COL_SINGULARITY, 0.3);
    g.lineBetween(r.x, floorY - r.h, r.x + r.w, floorY - r.h);
  }

  /** Stone that history hangs on: suspended until its tick, then immovable. */
  private drawMonolith(g: Phaser.GameObjects.Graphics, box: Box): void {
    const r = boxRect(box);
    const held = this.world.now < box.releaseTick;
    if (held) this.drawDropCorridor(g, r);
    g.fillStyle(0x151226, 1).fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(held ? 0x3a3550 : 0x4a4466, 1).fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    g.lineStyle(2, 0x6d4bd6, held ? 0.5 : 0.85).strokeRect(r.x, r.y, r.w, r.h);
    g.lineStyle(1, 0x241a44, 0.9);
    g.lineBetween(r.x + r.w * 0.3, r.y + 4, r.x + r.w * 0.45, r.y + r.h - 4);
    g.lineBetween(r.x + r.w * 0.7, r.y + 4, r.x + r.w * 0.58, r.y + r.h - 4);
    g.lineBetween(r.x + 4, r.y + r.h * 0.55, r.x + r.w - 4, r.y + r.h * 0.42);
  }

  private drawBox(g: Phaser.GameObjects.Graphics, box: Box): void {
    if (box.immovable) return this.drawMonolith(g, box);
    const r = boxRect(box);
    const rewinding = this.world.dir === -1 && !this.world.paused;
    g.fillStyle(0x7a4a1e, 1).fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(COL_BOX, 1).fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    g.fillStyle(0x7a4a1e, 1).fillRect(r.x + 6, r.y + r.h / 2 - 2, r.w - 12, 4);
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
      g.fillStyle(0x120c26, 1).fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle(color, 1).fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      const pulse = 0.25 + 0.2 * Math.sin(t + r.x);
      g.fillStyle(color, pulse).fillRect(r.x - 4, r.y - 16, r.w + 8, 16);
      g.lineStyle(1, color, 0.8).strokeRect(r.x - 4, r.y - 16, r.w + 8, r.h + 16);
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
    const pulse = 0.35 + 0.15 * Math.sin(this.time.now / 160);
    g.lineStyle(3, COL_PLAYER, pulse).strokeRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10);
    this.drawBody(g, p, COL_PLAYER, 1);
    g.fillStyle(0xffffff, 0.9).fillRect(r.x + r.w / 2 - 2, r.y - 12, 4, 6);
  }

  private drawGhost(g: Phaser.GameObjects.Graphics, s: PlayerState): void {
    this.drawBody(g, s, COL_GHOST, 0.42);
    const r = playerRect(s);
    g.lineStyle(1, COL_GHOST, 0.55).strokeRect(r.x, r.y, r.w, r.h);
  }

  /** A contradicted ghost, burning where its history broke, about to come after you. */
  private drawFuseGhost(g: Phaser.GameObjects.Graphics, s: Singularity): void {
    const t = this.time.now / 90;
    const heat = 1 - s.fuse / FUSE_TICKS;
    this.drawBody(g, s, COL_SINGULARITY, 0.55 + heat * 0.45);
    const r = playerRect(s);
    for (let i = 3; i >= 1; i--) {
      g.lineStyle(2, i % 2 === 0 ? 0xffd166 : COL_SINGULARITY, (0.15 + heat * 0.25) * i * 0.5);
      const pad = i * 4 + Math.sin(t * 2 + i) * 2;
      g.strokeRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
    }
    for (let i = 0; i < 6; i++) {
      const a = t * 3 + (i * Math.PI) / 3;
      const rad = 14 + Math.sin(t * 4 + i) * 5;
      g.fillStyle(i % 2 === 0 ? 0xffd166 : 0xffffff, 0.5 + heat * 0.5);
      g.fillRect(r.x + r.w / 2 + Math.cos(a) * rad, r.y + r.h / 2 + Math.sin(a) * rad, 3, 3);
    }
  }

  private drawSingularity(g: Phaser.GameObjects.Graphics, s: Singularity): void {
    if (s.fuse > 0) return this.drawFuseGhost(g, s);
    const t = this.time.now / 120;
    const r: Rect = { x: s.x, y: s.y, w: 20, h: 28 };
    for (let i = 3; i >= 1; i--) {
      g.fillStyle(COL_SINGULARITY, 0.08 * i);
      g.fillCircle(r.x + 10, r.y + 14, 16 + i * 6 + Math.sin(t + i) * 2);
    }
    g.fillStyle(0x1a0410, 0.95).fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(2, COL_SINGULARITY, 0.9).strokeRect(r.x, r.y, r.w, r.h);
    g.fillStyle(COL_SINGULARITY, 1).fillRect(r.x + 4, r.y + 6, 4, 4);
    g.fillStyle(COL_SINGULARITY, 1).fillRect(r.x + 12, r.y + 6, 4, 4);
  }
}
