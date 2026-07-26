import Phaser from 'phaser';
import { LEVELS, buildLevel } from './level';
import { VIEW_H, VIEW_W } from './GameScene';

const ROW_H = 54;
const TOP = 150;
const LEFT = 120;
const WIDTH = VIEW_W - 240;

/**
 * Level select. Everything is unlocked: the levels teach one device each and are
 * meant to be dipped into in any order.
 */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private rows: Phaser.GameObjects.Text[] = [];
  private cursor = 0;

  constructor() {
    super('menu');
  }

  create(): void {
    this.scene.stop('hud');
    this.gfx = this.add.graphics();

    this.add
      .text(VIEW_W / 2, 62, 'CHRONOSTROPHE', {
        fontFamily: 'monospace',
        fontSize: '38px',
        color: '#d6b3ff',
      })
      .setOrigin(0.5);
    this.add
      .text(VIEW_W / 2, 104, 'select a level  ·  ↑/↓ and ENTER, a number key, or click', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#8892bd',
      })
      .setOrigin(0.5);

    this.rows = LEVELS.map((_, i) => {
      const level = buildLevel(i);
      return this.add.text(LEFT + 20, TOP + i * ROW_H + 10, `${i + 1}. ${level.name.toUpperCase()}\n   ${level.brief}`, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#cfd8ff',
        lineSpacing: 4,
      });
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-ENTER', () => this.play(this.cursor));
    kb.on('keydown-SPACE', () => this.play(this.cursor));
    kb.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= LEVELS.length) this.play(n - 1);
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const row = this.rowAt(p);
      if (row !== null) this.cursor = row;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const row = this.rowAt(p);
      if (row !== null) this.play(row);
    });
  }

  private rowAt(p: Phaser.Input.Pointer): number | null {
    if (p.x < LEFT || p.x > LEFT + WIDTH) return null;
    const row = Math.floor((p.y - TOP) / ROW_H);
    return row >= 0 && row < LEVELS.length ? row : null;
  }

  private move(d: number): void {
    this.cursor = Phaser.Math.Wrap(this.cursor + d, 0, LEVELS.length);
  }

  private play(index: number): void {
    this.scene.start('game', { level: index });
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
        g.fillStyle(0xf7e26b, 0.4 + 0.5 * pulse).fillRect(LEFT + 4, y + 6, 4, ROW_H - 20);
      }
    });

    g.fillStyle(0x8892bd, 0.7).fillRect(LEFT, VIEW_H - 52, WIDTH, 1);
  }
}
