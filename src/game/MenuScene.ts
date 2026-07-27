import Phaser from 'phaser';
import { LEVELS, buildLevel } from './level';
import { VIEW_H, VIEW_W } from './GameScene';
import { fadeIn, fadeOutThen } from './transition';
import { sfx } from './audio';

const ROW_H = 42;
const TOP = 150;
const LEFT = 120;
const WIDTH = VIEW_W - 240;

/** The way into the level editor: press E on the menu and type it. */
const EDITOR_CODE = '8147';

/**
 * Level select. Everything is unlocked: the levels teach one device each and are
 * meant to be dipped into in any order.
 */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private rows: Phaser.GameObjects.Text[] = [];
  private cursor = 0;
  /** Digits typed since E was pressed; null while the menu is just a menu. */
  private code: string | null = null;
  private prompt!: Phaser.GameObjects.Text;

  constructor() {
    super('menu');
  }

  create(): void {
    this.scene.stop('hud');
    this.gfx = this.add.graphics();
    fadeIn(this);

    this.add
      .text(VIEW_W / 2, 62, 'CHRONOSTROPHE', {
        fontFamily: 'monospace',
        fontSize: '38px',
        color: '#d6b3ff',
      })
      .setOrigin(0.5);
    this.add
      .text(VIEW_W / 2, 104, 'select a level', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#8892bd',
      })
      .setOrigin(0.5);

    this.rows = LEVELS.map((_, i) => {
      const level = buildLevel(i);
      return this.add.text(LEFT + 20, TOP + i * ROW_H + 8, `${i + 1}. ${level.name.toUpperCase()}`, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#cfd8ff',
        lineSpacing: 4,
      });
    });

    this.prompt = this.add
      .text(VIEW_W / 2, VIEW_H - 34, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#8892bd',
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-ENTER', () => this.play(this.cursor));
    kb.on('keydown-SPACE', () => this.play(this.cursor));
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.typeCode(e)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= LEVELS.length) this.play(n - 1);
    });

    kb.on('keydown', () => sfx.unlock());
    this.input.on('pointerdown', () => sfx.unlock());
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const row = this.rowAt(p);
      if (row !== null && row !== this.cursor) this.move(row - this.cursor);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const row = this.rowAt(p);
      if (row !== null) this.play(row);
    });
  }

  /**
   * The editor's code, typed a digit at a time after E. Returns true while the
   * menu is listening for it, so the digits do not also start a level.
   */
  private typeCode(e: KeyboardEvent): boolean {
    if (this.code === null) {
      if (e.key.toLowerCase() !== 'e') return false;
      this.code = '';
      return true;
    }
    if (e.key === 'Escape') {
      this.code = null;
      return true;
    }
    if (e.key === 'Backspace') {
      this.code = this.code.slice(0, -1);
      return true;
    }
    if (!/^[0-9]$/.test(e.key)) return true;
    this.code += e.key;
    if (this.code === EDITOR_CODE) {
      this.code = null;
      sfx.unlock();
      sfx.menuSelect();
      fadeOutThen(this, 200, () => this.scene.start('editor'));
    } else if (!EDITOR_CODE.startsWith(this.code)) {
      this.code = '';
    }
    return true;
  }

  private rowAt(p: Phaser.Input.Pointer): number | null {
    if (p.x < LEFT || p.x > LEFT + WIDTH) return null;
    const row = Math.floor((p.y - TOP) / ROW_H);
    return row >= 0 && row < LEVELS.length ? row : null;
  }

  private move(d: number): void {
    this.cursor = Phaser.Math.Wrap(this.cursor + d, 0, LEVELS.length);
    sfx.menuMove();
  }

  private play(index: number): void {
    sfx.unlock();
    sfx.menuSelect();
    fadeOutThen(this, 200, () => this.scene.start('game', { level: index }));
  }

  override update(time: number): void {
    const g = this.gfx;
    g.clear();
    LEVELS.forEach((_, i) => {
      const on = i === this.cursor;
      const y = TOP + i * ROW_H;
      g.fillStyle(0x6d4bd6, on ? 0.22 : 0.08).fillRect(LEFT, y, WIDTH, ROW_H - 8);
      g.lineStyle(1, 0x6d4bd6, on ? 0.9 : 0.3).strokeRect(LEFT, y, WIDTH, ROW_H - 8);
      this.rows[i].setColor(on ? '#ffffff' : '#cfd8ff');
      if (on) {
        const pulse = 0.5 + 0.5 * Math.sin(time / 260);
        g.fillStyle(0xf7e26b, 0.4 + 0.5 * pulse).fillRect(LEFT + 4, y + 6, 4, ROW_H - 18);
      }
    });

    g.fillStyle(0x8892bd, 0.7).fillRect(LEFT, VIEW_H - 52, WIDTH, 1);
    this.prompt.setText(this.code === null ? '' : `editor code ${'*'.repeat(this.code.length)}_`);
  }
}
