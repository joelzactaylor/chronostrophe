import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './GameScene';
import { sfx } from './audio';
import { fadeIn, fadeOutThen } from './transition';

/** The front door: entering here keeps the level archive as a distinct second screen. */
export class TitleScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private titleGlow!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private entering = false;

  constructor() {
    super('title');
  }

  create(): void {
    this.scene.stop('hud');
    this.gfx = this.add.graphics();
    fadeIn(this);

    this.titleGlow = this.add
      .text(VIEW_W / 2 + 4, 208, 'CHRONOSTROPHE', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '52px',
        color: '#6d4bd6',
      })
      .setOrigin(0.5)
      .setAlpha(0.55);
    this.add
      .text(VIEW_W / 2, 202, 'CHRONOSTROPHE', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '52px',
        color: '#f8f5ff',
        stroke: '#241a44',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.add
      .text(VIEW_W / 2, 264, 'BE THE MASTER OF YOUR TIMELINE', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#76d9ff',
      })
      .setOrigin(0.5);
    this.prompt = this.add
      .text(VIEW_W / 2, 404, '[ CLICK TO ENTER THE ARCHIVE ]', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#f7e26b',
      })
      .setOrigin(0.5);

    this.input.once('pointerdown', () => this.enter());
    const kb = this.input.keyboard!;
    kb.once('keydown-ENTER', () => this.enter());
    kb.once('keydown-SPACE', () => this.enter());
  }

  private enter(): void {
    if (this.entering) return;
    this.entering = true;
    sfx.unlock();
    sfx.menuSelect();
    fadeOutThen(this, 220, () => this.scene.start('menu'));
  }

  override update(time: number): void {
    const g = this.gfx;
    const t = time / 1000;
    g.clear();
    for (let i = 0; i < 72; i++) {
      const x = (i * 149 + 41) % VIEW_W;
      const y = (i * 233 + 67 + Math.sin(t + i) * 8) % VIEW_H;
      const alpha = 0.16 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.7 + i));
      g.fillStyle(i % 7 === 0 ? 0x38bdf8 : 0x4b3b78, alpha).fillRect(x, y, 1 + (i % 3), 1 + (i % 3));
    }
    const cx = VIEW_W / 2;
    const cy = 346;
    for (let i = 5; i >= 1; i--) {
      const radius = 65 + i * 28 + Math.sin(t * 1.8 + i) * 5;
      const start = t * (i % 2 ? 0.8 : -0.65) + i;
      g.lineStyle(2, i % 2 ? 0x8b5cf6 : 0x38bdf8, 0.07 + i * 0.035);
      g.beginPath().arc(cx, cy, radius, start, start + 2.25).strokePath();
    }
    g.fillStyle(0xf7e26b, 0.35 + 0.18 * Math.sin(t * 4)).fillCircle(cx, cy, 7);
    this.titleGlow.setPosition(cx + 4 + Math.sin(t * 12) * 1.5, 208 + Math.cos(t * 9) * 1.5);
    this.prompt.setAlpha(0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3.2)));
  }
}
