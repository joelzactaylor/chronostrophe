import Phaser from 'phaser';
import { TICKS, clamp } from '../core/types';
import { GameScene, VIEW_H, VIEW_W } from './GameScene';

const TRACK_X = 120;
const TRACK_W = VIEW_W - 200;
const TRACK_Y = VIEW_H + 58;
const PANEL_H = 96;

type Button = { x: number; y: number; w: number; h: number };

/** "Give up on this run": the way out of a level that has walled itself off. */
const ABANDON: Button = { x: VIEW_W - 132, y: VIEW_H + 8, w: 116, h: 24 };
const MENU: Button = { x: VIEW_W - 226, y: VIEW_H + 8, w: 86, h: 24 };

function hit(b: Button, p: Phaser.Input.Pointer): boolean {
  return p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
}

export class HudScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private dirText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private abandon!: Phaser.GameObjects.Text;
  private menu!: Phaser.GameObjects.Text;
  private dragging = false;

  constructor() {
    super('hud');
  }

  private get game_(): GameScene {
    return this.scene.get('game') as GameScene;
  }

  create(): void {
    this.gfx = this.add.graphics();
    const font = { fontFamily: 'monospace', fontSize: '14px', color: '#cfd8ff' };
    this.status = this.add.text(16, VIEW_H + 10, '', font);
    this.clock = this.add.text(VIEW_W - 78, TRACK_Y - 9, '', { ...font, color: '#f7e26b' });
    this.dirText = this.add.text(16, TRACK_Y - 9, '', { ...font, color: '#76d9ff' });
    this.banner = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 20, '', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
    this.hint = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 26, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#b9c3ea',
        align: 'center',
      })
      .setOrigin(0.5);

    this.abandon = this.add
      .text(ABANDON.x + ABANDON.w / 2, ABANDON.y + ABANDON.h / 2, 'ABANDON RUN [K]', {
        ...font,
        fontSize: '12px',
        color: '#ffb3c1',
      })
      .setOrigin(0.5);

    this.menu = this.add
      .text(MENU.x + MENU.w / 2, MENU.y + MENU.h / 2, 'LEVELS', {
        ...font,
        fontSize: '12px',
        color: '#b9c3ea',
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (hit(ABANDON, p)) {
        this.game_.abandonRun();
        return;
      }
      if (hit(MENU, p)) {
        this.game_.openMenu();
        return;
      }
      if (this.hitTrack(p)) {
        this.dragging = true;
        this.scrubFromPointer(p);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging && p.isDown) this.scrubFromPointer(p);
      else if (!p.isDown) this.dragging = false;
    });
    this.input.on('pointerup', () => (this.dragging = false));
  }

  private hitTrack(p: Phaser.Input.Pointer): boolean {
    return p.y > VIEW_H + 30 && p.x > TRACK_X - 30 && p.x < TRACK_X + TRACK_W + 30;
  }

  private scrubFromPointer(p: Phaser.Input.Pointer): void {
    const scene = this.game_;
    if (!scene.canScrub()) return;
    const k = clamp((p.x - TRACK_X) / TRACK_W, 0, 1);
    scene.scrub(Math.round(k * TICKS));
  }

  override update(): void {
    const scene = this.game_;
    if (!scene?.world) return;
    const w = scene.world;
    const g = this.gfx;
    g.clear();

    g.fillStyle(0x080512, 1).fillRect(0, VIEW_H, VIEW_W, PANEL_H);
    g.fillStyle(0x6d4bd6, 0.6).fillRect(0, VIEW_H, VIEW_W, 2);

    const p = this.input.activePointer;
    const overAbandon = hit(ABANDON, p);
    g.fillStyle(0xf43f5e, overAbandon ? 0.28 : 0.14).fillRect(ABANDON.x, ABANDON.y, ABANDON.w, ABANDON.h);
    g.lineStyle(1, 0xf43f5e, overAbandon ? 0.9 : 0.55).strokeRect(ABANDON.x, ABANDON.y, ABANDON.w, ABANDON.h);
    this.abandon.setColor(overAbandon ? '#ffffff' : '#ffb3c1');

    const overMenu = hit(MENU, p);
    g.fillStyle(0x6d4bd6, overMenu ? 0.3 : 0.14).fillRect(MENU.x, MENU.y, MENU.w, MENU.h);
    g.lineStyle(1, 0x6d4bd6, overMenu ? 0.9 : 0.55).strokeRect(MENU.x, MENU.y, MENU.w, MENU.h);
    this.menu.setColor(overMenu ? '#ffffff' : '#b9c3ea');

    // recorded history coverage
    for (const run of w.runs) {
      const a = TRACK_X + (run.tMin / TICKS) * TRACK_W;
      const b = TRACK_X + (run.tMax / TICKS) * TRACK_W;
      g.fillStyle(0x76d9ff, 0.35).fillRect(a, TRACK_Y - 12, Math.max(2, b - a), 5);
    }
    const cur = w.current;
    if (cur.tMax > cur.tMin) {
      const a = TRACK_X + (cur.tMin / TICKS) * TRACK_W;
      const b = TRACK_X + (cur.tMax / TICKS) * TRACK_W;
      g.fillStyle(0xf7e26b, 0.5).fillRect(a, TRACK_Y - 12, Math.max(2, b - a), 5);
    }

    g.fillStyle(0x1b1436, 1).fillRect(TRACK_X, TRACK_Y - 3, TRACK_W, 6);
    for (let i = 0; i <= 12; i++) {
      const x = TRACK_X + (i / 12) * TRACK_W;
      g.fillStyle(0x38306a, 1).fillRect(x, TRACK_Y - 8, 1, 16);
    }
    g.fillStyle(0xf43f5e, 0.9).fillRect(TRACK_X - 3, TRACK_Y - 12, 3, 24);
    g.fillStyle(0xf43f5e, 0.9).fillRect(TRACK_X + TRACK_W, TRACK_Y - 12, 3, 24);

    const dotX = TRACK_X + (w.now / TICKS) * TRACK_W;
    const live = scene.canScrub();
    g.fillStyle(live ? 0x38bdf8 : 0xf7e26b, 0.3).fillCircle(dotX, TRACK_Y, 14);
    g.fillStyle(live ? 0x38bdf8 : 0xf7e26b, 1).fillCircle(dotX, TRACK_Y, 8);
    g.fillStyle(0x08040f, 1).fillCircle(dotX, TRACK_Y, 3);

    // direction arrow
    const ax = 92;
    const s = w.dir;
    g.fillStyle(w.paused ? 0x8892bd : 0x76d9ff, 1);
    g.fillRect(ax - 22, TRACK_Y - 2, 30, 4);
    g.fillTriangle(
      ax + (s === 1 ? 8 : -22),
      TRACK_Y - 9,
      ax + (s === 1 ? 8 : -22),
      TRACK_Y + 9,
      ax + (s === 1 ? 22 : -36),
      TRACK_Y,
    );

    const secs = (w.now / 60).toFixed(2);
    this.clock.setText(`T ${secs}s`);
    this.dirText.setText(w.paused ? 'PAUSED' : w.dir === 1 ? 'FORWARD' : 'REVERSE');
    this.dirText.setColor(w.paused ? '#8892bd' : w.dir === 1 ? '#76d9ff' : '#f7a1ff');
    const ghosts = w.ghostsAt(w.now).length;
    const level = `${scene.levelIndex + 1}. ${scene.level.name.toUpperCase()}`;
    this.status.setText(
      `${level}    ·    ${scene.message || scene.level.brief}    ·    ghosts:${ghosts}  runs:${w.runs.length}` +
        (scene.canScrub() ? '    ·    drag the slider' : ''),
    );

    this.drawOverlay(scene);
  }

  private drawOverlay(scene: GameScene): void {
    const g = this.gfx;
    switch (scene.state) {
      case 'won':
        g.fillStyle(0x05030a, 0.72).fillRect(0, 0, VIEW_W, VIEW_H);
        this.banner.setText('TIMELINE RESOLVED').setColor('#f7e26b');
        this.hint.setText(
          scene.hasNextLevel
            ? 'You slipped through the singularity gate.\n[ENTER] next level'
            : 'You slipped through the singularity gate.\n[ENTER] play again',
        );
        break;
      case 'dust':
        this.banner.setText('THE UNIVERSE ENDS').setColor('#d6b3ff');
        this.hint.setText(scene.message);
        break;
      case 'fisheye':
        this.banner.setText('PARADOX COLLAPSE').setColor('#ff4d6d');
        this.hint.setText('A singularity caught you.');
        break;
      case 'death':
        this.banner.setText('DEAD').setColor('#ff4d6d');
        this.hint.setText(scene.message);
        break;
      default:
        this.banner.setText('');
        this.hint.setText('');
    }
  }
}
