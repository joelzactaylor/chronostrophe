import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from './GameScene';
import { sfx, music } from './audio';
import { fadeIn, fadeOutThen } from './transition';
import {
  COL_TITLE,
  COL_TITLE_GLOW,
  COL_TITLE_STROKE,
  COL_TEXT_ACCENT,
  COL_ORBIT_A,
  COL_ORBIT_B,
  STAR_COLORS,
  initTheme,
} from './theme';

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
    this.entering = false;
    initTheme();
    this.gfx = this.add.graphics();
    fadeIn(this);
    void music.init(); // ensure music is pre-rendered
    void music.playMenu();

    const glow = COL_TITLE_GLOW();
    const glowCss = `#${glow.toString(16).padStart(6, '0')}`;
    this.titleGlow = this.add
      .text(VIEW_W / 2 + 4, 208, 'CHRONOSTROPHE', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '52px',
        color: glowCss,
      })
      .setOrigin(0.5)
      .setAlpha(0.55);
    const title = COL_TITLE();
    const titleCss = `#${title.toString(16).padStart(6, '0')}`;
    const stroke = COL_TITLE_STROKE();
    const strokeCss = `#${stroke.toString(16).padStart(6, '0')}`;
    this.add
      .text(VIEW_W / 2, 202, 'CHRONOSTROPHE', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '52px',
        color: titleCss,
        stroke: strokeCss,
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    const accent = COL_TEXT_ACCENT();
    const accentCss = `#${accent.toString(16).padStart(6, '0')}`;
    this.add
      .text(VIEW_W / 2, 264, 'BE THE MASTER OF YOUR TIMELINE', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: accentCss,
      })
      .setOrigin(0.5);
    const goldCss = `#${0xf7e26b.toString(16).padStart(6, '0')}`;
    this.prompt = this.add
      .text(VIEW_W / 2, 404, '[ CLICK TO ENTER THE ARCHIVE ]', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: goldCss,
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', () => this.enter());
    const kb = this.input.keyboard!;
    kb.on('keydown-ENTER', () => this.enter());
    kb.on('keydown-SPACE', () => this.enter());
    kb.on('keydown-ESC', () => this.enter());
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
    const starColors = STAR_COLORS();
    for (let i = 0; i < 72; i++) {
      const x = (i * 149 + 41) % VIEW_W;
      const y = (i * 233 + 67 + Math.sin(t + i) * 8) % VIEW_H;
      const alpha = 0.16 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.7 + i));
      g.fillStyle(starColors[i % starColors.length], alpha).fillRect(x, y, 1 + (i % 3), 1 + (i % 3));
    }
    const cx = VIEW_W / 2;
    const cy = 346;
    const orbitA = COL_ORBIT_A();
    const orbitB = COL_ORBIT_B();
    for (let i = 5; i >= 1; i--) {
      const radius = 65 + i * 28 + Math.sin(t * 1.8 + i) * 5;
      const start = t * (i % 2 ? 0.8 : -0.65) + i;
      g.lineStyle(2, i % 2 ? orbitA : orbitB, 0.07 + i * 0.035);
      g.beginPath().arc(cx, cy, radius, start, start + 2.25).strokePath();
    }
    g.fillStyle(0xf7e26b, 0.35 + 0.18 * Math.sin(t * 4)).fillCircle(cx, cy, 7);
    const glowX = cx + 4 + Math.sin(t * 12) * 1.5;
    const glowY = 208 + Math.cos(t * 9) * 1.5;
    this.titleGlow.setPosition(glowX, glowY);
    this.prompt.setAlpha(0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3.2)));
  }
}

