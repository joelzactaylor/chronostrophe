import Phaser from 'phaser';
import { LEVELS, buildLevel } from './level';
import { VIEW_H, VIEW_W } from './GameScene';
import { fadeIn, fadeOutThen } from './transition';
import { sfx, music } from './audio';
import { clearStoredGameData, loadCompletedLevels } from './progress';
import {
  COL_ORBIT_A,
  COL_ORBIT_B,
  COL_COMPLETE,
  COL_SEPARATOR,
  COL_MODAL_BG,
  COL_SETTINGS_STROKE,
  COL_HELP_TEXT,
  COL_BUTTON_DEFAULT,
  COL_BUTTON_DANGER,
  COL_TEXT_PRIMARY,
  COL_TEXT_SECONDARY,
  COL_TEXT_ACCENT,
  COL_TITLE,
  COL_TITLE_GLOW,
  COL_TITLE_STROKE,
  STAR_COLORS,
  COL_ROW_TEXT,
  COL_ROW_TEXT_SELECTED,
  TEXT_HIGHLIGHT,
  ROW_BORDER,
  initTheme,
} from './theme';

const ROW_H = 42;
const TOP = 150;
const LEFT = 120;
const SPAN = VIEW_W - 240;
const COL_GAP = 16;
/** The last row has to clear the rule and the prompt under it. */
const BOTTOM = VIEW_H - 70;
const HELP = { x: VIEW_W / 2 - 44, y: VIEW_H - 34, w: 88, h: 24 };
const SETTINGS = { x: VIEW_W - 180, y: VIEW_H - 34, w: 120, h: 24 };
// Settings panel layout
const SETTINGS_PANEL = { x: 260, y: 148, w: 440, h: 340 };
const SETTINGS_ROW_X = 278;
const SETTINGS_ROW_W = 404;
const SETTINGS_ROW_H = 36;
const SETTINGS_ROW_GAP = 6;
const SETTINGS_FIRST_ROW_Y = 200;

const LEVEL_PADDING = 8;

function hit(b: { x: number; y: number; w: number; h: number }, p: Phaser.Input.Pointer): boolean {
  return p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
}

function settingsRowRect(index: number): { x: number; y: number; w: number; h: number } {
  return {
    x: SETTINGS_ROW_X,
    y: SETTINGS_FIRST_ROW_Y + index * (SETTINGS_ROW_H + SETTINGS_ROW_GAP),
    w: SETTINGS_ROW_W,
    h: SETTINGS_ROW_H,
  };
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  color: number;
}

/** How the list is laid out for a given number of levels: down, then across. */
function layout(count: number): { perCol: number; cols: number; width: number } {
  const fits = Math.max(1, Math.floor((BOTTOM - TOP) / ROW_H));
  const cols = Math.max(1, Math.ceil(count / fits));
  const perCol = Math.ceil(count / cols);
  return { perCol, cols, width: (SPAN - COL_GAP * (cols - 1)) / cols };
}

/** Where a level's row sits. */
function slot(i: number, count: number): { x: number; y: number; w: number } {
  const { perCol, width } = layout(count);
  return {
    x: LEFT + Math.floor(i / perCol) * (width + COL_GAP),
    y: TOP + (i % perCol) * ROW_H,
    w: width,
  };
}

/** The private level-authoring access sequence. */
const EDITOR_CODE = '8147';

/**
 * Level select. Everything is unlocked: the levels teach one device each and are
 * meant to be dipped into in any order.
 */
export class MenuScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private modalGfx!: Phaser.GameObjects.Graphics;
  private rows: Phaser.GameObjects.Text[] = [];
  private cursor = 0;
  private code: string | null = null;
  private prompt!: Phaser.GameObjects.Text;
  private titleGlow!: Phaser.GameObjects.Text;
  private stars: Star[] = [];
  private completed = new Set<number>();
  private helpOpen = false;
  private settingsOpen = false;
  private helpText!: Phaser.GameObjects.Text;
  private helpButton!: Phaser.GameObjects.Text;
  private settingsButton!: Phaser.GameObjects.Text;
  private settingsRowTexts: Phaser.GameObjects.Text[] = [];
  private pointerInLevels = false;
  private keyboardFocused = true;

  constructor() {
    super('menu');
  }

  create(): void {
    this.scene.stop('hud');
    initTheme();
    this.gfx = this.add.graphics();
    this.modalGfx = this.add.graphics().setDepth(1);
    this.completed = loadCompletedLevels();
    this.initStars();
    fadeIn(this);
    void music.init();
    void music.playMenu();

    const glow = COL_TITLE_GLOW();
    const glowCss = `#${glow.toString(16).padStart(6, '0')}`;
    this.titleGlow = this.add
      .text(VIEW_W / 2 + 3, 65, 'CHRONOSTROPHE', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '34px',
        color: glowCss,
      })
      .setOrigin(0.5)
      .setAlpha(0.5);
    const title = COL_TITLE();
    const titleCss = `#${title.toString(16).padStart(6, '0')}`;
    const stroke = COL_TITLE_STROKE();
    const strokeCss = `#${stroke.toString(16).padStart(6, '0')}`;
    this.add
      .text(VIEW_W / 2, 62, 'CHRONOSTROPHE', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '34px',
        color: titleCss,
        stroke: strokeCss,
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const accent = COL_TEXT_ACCENT();
    const accentCss = `#${accent.toString(16).padStart(6, '0')}`;
    this.add
      .text(VIEW_W / 2, 104, 'TIMELINE ARCHIVE  ·  SELECT A LEVEL', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: accentCss,
      })
      .setOrigin(0.5);

    this.rows = LEVELS.map((_, i) => {
      const level = buildLevel(i);
      const s = slot(i, LEVELS.length);
      const rowText = COL_ROW_TEXT();
      return this.add
        .text(s.x + 20, s.y + 8, `${i + 1}. ${level.name.toUpperCase()}`, {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: rowText,
          lineSpacing: 4,
        })
        .setFixedSize(s.w - 28, 0)
        .setWordWrapWidth(s.w - 28);
    });

    const secondary = COL_TEXT_SECONDARY();
    const secondaryCss = `#${secondary.toString(16).padStart(6, '0')}`;
    this.prompt = this.add
      .text(VIEW_W / 2, VIEW_H - 68, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: secondaryCss,
      })
      .setOrigin(0.5);
    const primary = COL_TEXT_PRIMARY();
    const primaryCss = `#${primary.toString(16).padStart(6, '0')}`;
    this.helpButton = this.add
      .text(HELP.x + HELP.w / 2, HELP.y + HELP.h / 2, 'HELP [H]', {
        fontFamily: 'monospace', fontSize: '12px', color: primaryCss,
      })
      .setOrigin(0.5);
    this.settingsButton = this.add
      .text(SETTINGS.x + SETTINGS.w / 2, SETTINGS.y + SETTINGS.h / 2, 'SETTINGS', {
        fontFamily: 'monospace', fontSize: '12px', color: primaryCss,
      })
      .setOrigin(0.5);
    const helpCss = `#${COL_HELP_TEXT().toString(16).padStart(6, '0')}`;
    this.helpText = this.add
      .text(
        VIEW_W / 2,
        178,
        'TIME & CONTROLS\n\n' +
        '• The bar at the bottom of the screen is the timeline. If time reaches either\n' +
        '  red end marker, the universe ends and the level restarts.\n' +
        '• Be careful not to create a paradox.\n' +
        '• Grey squares above the timeline mark events that happen at a fixed time.\n' +
        '• Use [A] [D] or [←] [→] to move. [W] [↑] or [SPACE] jumps; [S] [↓] crouches.\n' +
        '• [K] abandons the current run and restarts the level. [ESC] returns here.\n' +
        '• [M] toggles sound.\n\n' +
        '[ CLICK, H, OR ESC TO CLOSE ]',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: helpCss,
          align: 'left',
          lineSpacing: 5,
        },
      )
      .setOrigin(0.5, 0)
      .setDepth(2)
      .setVisible(false);

    const { settingsLabelTexts, settingsValueTexts } = this.createSettingsTexts();
    this.settingsRowTexts = [...settingsLabelTexts, ...settingsValueTexts];

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.move(-1));
    kb.on('keydown-DOWN', () => this.move(1));
    kb.on('keydown-W', () => this.move(-1));
    kb.on('keydown-S', () => this.move(1));
    kb.on('keydown-LEFT', () => this.move(-layout(LEVELS.length).perCol));
    kb.on('keydown-RIGHT', () => this.move(layout(LEVELS.length).perCol));
    kb.on('keydown-A', () => this.move(-layout(LEVELS.length).perCol));
    kb.on('keydown-D', () => this.move(layout(LEVELS.length).perCol));
    kb.on('keydown-ENTER', () => this.play(this.cursor));
    kb.on('keydown-SPACE', () => this.play(this.cursor));
    kb.on('keydown-H', () => this.toggleHelp());
    kb.on('keydown-ESC', () => {
      if (this.helpOpen) this.toggleHelp();
      else if (this.settingsOpen) this.toggleSettings();
      else if (this.code === null) fadeOutThen(this, 200, () => this.scene.start('title'));
    });
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.modalOpen) return;
      if (this.typeCode(e)) return;
      const n = /^[0-9]$/.test(e.key) ? (e.key === '0' ? 10 : Number(e.key)) : NaN;
      if (n >= 1 && n <= LEVELS.length) this.play(n - 1);
    });

    kb.on('keydown', () => sfx.unlock());
    this.input.on('pointerdown', () => sfx.unlock());
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.modalOpen) return;
      this.pointerInLevels = this.inLevelBounds(p);
      if (!this.pointerInLevels) {
        this.keyboardFocused = false;
        return;
      }
      const row = this.nearestLevel(p);
      if (row !== null && row !== this.cursor) this.move(row - this.cursor);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.helpOpen) {
        this.toggleHelp();
        return;
      }
      if (this.settingsOpen) {
        const hitRow = this.settingsRowAt(p);
        if (hitRow === 3) this.resetSaves();
        else if (hitRow === 0) sfx.toggleMute();
        else if (hitRow === 1) this.toggleFullscreen();
        else if (!hit(SETTINGS_PANEL, p)) this.toggleSettings();
        return;
      }
      if (hit(HELP, p)) {
        this.toggleHelp();
        return;
      }
      if (hit(SETTINGS, p)) {
        this.toggleSettings();
        return;
      }
      const row = this.rowAt(p);
      if (row !== null) this.play(row);
    });
  }

  private initStars(): void {
    const starColors = STAR_COLORS();
    this.stars = Array.from({ length: 68 }, (_, i) => ({
      x: (i * 149 + 41) % VIEW_W,
      y: (i * 233 + 67) % VIEW_H,
      size: 1 + (i % 3),
      phase: i * 0.73,
      color: starColors[i % starColors.length],
    }));
  }

  /**
   * The private authoring sequence, typed a digit at a time.
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
    const { perCol, cols, width } = layout(LEVELS.length);
    const col = Math.floor((p.x - LEFT) / (width + COL_GAP));
    if (col < 0 || col >= cols) return null;
    if (p.x > LEFT + col * (width + COL_GAP) + width) return null;
    const row = Math.floor((p.y - TOP) / ROW_H);
    if (row < 0 || row >= perCol) return null;
    const i = col * perCol + row;
    return i < LEVELS.length ? i : null;
  }

  private nearestLevel(p: Phaser.Input.Pointer): number | null {
    if (!this.inLevelBounds(p)) return null;
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    LEVELS.forEach((_, i) => {
      const s = slot(i, LEVELS.length);
      const dx = p.x - (s.x + s.w / 2);
      const dy = p.y - (s.y + (ROW_H - 8) / 2);
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        nearest = i;
        best = d2;
      }
    });
    return nearest;
  }

  private inLevelBounds(p: Phaser.Input.Pointer): boolean {
    const { perCol } = layout(LEVELS.length);
    const h = perCol * ROW_H - 8;
    return (
      p.x >= LEFT - LEVEL_PADDING &&
      p.x <= LEFT + SPAN + LEVEL_PADDING &&
      p.y >= TOP - LEVEL_PADDING &&
      p.y <= TOP + h + LEVEL_PADDING
    );
  }

  private move(d: number): void {
    if (this.modalOpen) return;
    this.keyboardFocused = true;
    this.cursor = Phaser.Math.Wrap(this.cursor + d, 0, LEVELS.length);
    sfx.menuMove();
  }

  private play(index: number): void {
    if (this.modalOpen) return;
    sfx.unlock();
    sfx.menuSelect();
    music.stopMenu();
    fadeOutThen(this, 200, () => this.scene.start('game', { level: index }));
  }

  override update(time: number): void {
    const g = this.gfx;
    g.clear();
    this.modalGfx.clear();
    const t = time / 1000;

    const orbitA = COL_ORBIT_A();
    const orbitB = COL_ORBIT_B();

    for (const star of this.stars) {
      const alpha = 0.16 + 0.42 * (0.5 + 0.5 * Math.sin(t * 1.7 + star.phase));
      g.fillStyle(star.color, alpha).fillRect(star.x, star.y, star.size, star.size);
    }

    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2 + 28;
    for (let i = 4; i >= 1; i--) {
      const radius = 112 + i * 46 + Math.sin(t * 1.5 + i) * 5;
      const start = t * (i % 2 === 0 ? -0.5 : 0.65) + i;
      g.lineStyle(1, i % 2 ? orbitA : orbitB, 0.045 + i * 0.025);
      g.beginPath().arc(cx, cy, radius, start, start + 2.25).strokePath();
    }
    g.lineStyle(1, orbitA, 0.55).lineBetween(LEFT, 126, LEFT + SPAN, 126);
    for (let i = 0; i < 9; i++) {
      const x = (t * (28 + i * 5) + i * 137) % (VIEW_W + 180) - 90;
      const y = 132 + ((i * 61) % 342);
      const color = i % 3 === 0 ? orbitB : orbitA;
      g.fillStyle(color, 0.1 + 0.05 * Math.sin(t * 2 + i)).fillRect(x, y, 68 + i * 9, 1);
      g.fillStyle(color, 0.38).fillRect(x + 68 + i * 9, y - 1, 3, 3);
    }

    const complete = COL_COMPLETE();
    const rowText = COL_ROW_TEXT();
    const rowTextSelected = COL_ROW_TEXT_SELECTED();
    LEVELS.forEach((_, i) => {
      const on = (this.pointerInLevels || this.keyboardFocused) && i === this.cursor;
      const s = slot(i, LEVELS.length);
      const border = ROW_BORDER(on);
      g.fillStyle(border, on ? 0.3 : 0.09).fillRect(s.x, s.y, s.w, ROW_H - 8);
      g.lineStyle(1, border, on ? 0.95 : 0.3).strokeRect(s.x, s.y, s.w, ROW_H - 8);
      this.rows[i].setColor(on ? rowTextSelected : rowText);
      if (on) {
        const pulse = 0.5 + 0.5 * Math.sin(time / 260);
        g.fillStyle(orbitB, 0.08 + 0.08 * pulse).fillRect(s.x, s.y + 2, s.w, ROW_H - 12);
        g.fillStyle(0xf7e26b, 0.4 + 0.5 * pulse).fillRect(s.x + 4, s.y + 6, 4, ROW_H - 18);
      }
      if (this.completed.has(i)) {
        const x = s.x + s.w - 17;
        const y = s.y + 18;
        g.lineStyle(2, complete, 0.95).lineBetween(x, y, x + 4, y + 4).lineBetween(x + 4, y + 4, x + 11, y - 5);
      }
    });

    const separator = COL_SEPARATOR();
    g.fillStyle(separator, 0.7).fillRect(LEFT, VIEW_H - 42, SPAN, 1);
    const pointer = this.input.activePointer;
    const overHelp = hit(HELP, pointer);
    const overSettings = hit(SETTINGS, pointer);
    this.drawButton(g, HELP, overHelp, orbitB);
    this.drawButton(g, SETTINGS, overSettings, orbitA);
    const highlight = TEXT_HIGHLIGHT();
    const primary = COL_TEXT_PRIMARY();
    const primaryCss = `#${primary.toString(16).padStart(6, '0')}`;
    this.helpButton.setColor(overHelp ? highlight : primaryCss);
    this.settingsButton.setColor(overSettings ? highlight : primaryCss);
    this.prompt.setText(this.code === null ? '' : `author access ${'*'.repeat(this.code.length)}_`);
    this.titleGlow.setPosition(VIEW_W / 2 + 3 + Math.sin(t * 12) * 1.5, 65 + Math.cos(t * 8) * 1.5);

    const modalBg = COL_MODAL_BG();
    const settingsStroke = COL_SETTINGS_STROKE();
    if (this.helpOpen) {
      this.modalGfx.fillStyle(modalBg, 0.9).fillRect(76, 140, VIEW_W - 152, 316);
      this.modalGfx.lineStyle(2, settingsStroke, 0.8).strokeRect(76, 140, VIEW_W - 152, 316);
      this.helpText.setVisible(true);
    } else {
      this.helpText.setVisible(false);
    }
    if (this.settingsOpen) this.drawSettings(pointer);
    else this.settingsRowTexts.forEach((t) => t.setVisible(false));
  }

  private toggleHelp(): void {
    this.helpOpen = !this.helpOpen;
    this.settingsOpen = false;
  }

  private toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.helpOpen = false;
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  private resetSaves(): void {
    if (!window.confirm('Clear all saved game data?')) return;
    clearStoredGameData();
    this.completed.clear();
    this.settingsOpen = false;
  }

  private settingsRowAt(p: Phaser.Input.Pointer): number | null {
    for (let i = 0; i < 4; i++) {
      const r = settingsRowRect(i);
      if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) {
        return i;
      }
    }
    return null;
  }

  private createSettingsTexts(): { settingsLabelTexts: Phaser.GameObjects.Text[]; settingsValueTexts: Phaser.GameObjects.Text[] } {
    const primary = COL_TEXT_PRIMARY();
    const primaryCss = `#${primary.toString(16).padStart(6, '0')}`;
    const danger = COL_BUTTON_DANGER();
    const dangerCss = `#${danger.toString(16).padStart(6, '0')}`;

    const labels = ['SOUND', 'FULLSCREEN', '', 'RESET ALL DATA'];
    const settingsLabelTexts = labels.map((text, i) => {
      const r = settingsRowRect(i);
      return this.add
        .text(r.x + 12, r.y + r.h / 2, text, {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: i === 3 ? dangerCss : primaryCss,
        })
        .setOrigin(0, 0.5)
        .setDepth(2)
        .setVisible(false);
    });

    const settingsValueTexts = [0, 1, 2, 3].map((i) => {
      const r = settingsRowRect(i);
      const secondary = COL_TEXT_SECONDARY();
      const secondaryCss = `#${secondary.toString(16).padStart(6, '0')}`;
      return this.add
        .text(r.x + r.w - 12, r.y + r.h / 2, '', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: i === 3 ? dangerCss : secondaryCss,
        })
        .setOrigin(1, 0.5)
        .setDepth(2)
        .setVisible(false);
    });

    return { settingsLabelTexts, settingsValueTexts };
  }

  private drawSettings(pointer: Phaser.Input.Pointer): void {
    const panel = SETTINGS_PANEL;
    const modalBg = COL_MODAL_BG();
    const settingsStroke = COL_SETTINGS_STROKE();
    const buttonDefault = COL_BUTTON_DEFAULT();
    const buttonDanger = COL_BUTTON_DANGER();

    this.modalGfx.fillStyle(modalBg, 0.92).fillRect(panel.x, panel.y, panel.w, panel.h);
    this.modalGfx.lineStyle(2, settingsStroke, 0.85).strokeRect(panel.x, panel.y, panel.w, panel.h);

    // Update dynamic value texts for sound and fullscreen
    if (this.settingsRowTexts.length >= 8) {
      this.settingsRowTexts[4].setText(sfx.isMuted ? 'OFF' : 'ON');
      this.settingsRowTexts[5].setText(document.fullscreenElement ? 'ON' : 'OFF');
      this.settingsRowTexts[6].setText('');
      this.settingsRowTexts[7].setText('CLEAR SAVES');
    }

    // Draw each settings row
    for (let i = 0; i < 4; i++) {
      const r = settingsRowRect(i);
      const over = hit(r, pointer);

      if (i === 2) {
        // Separator line
        const separator = COL_SEPARATOR();
        this.modalGfx.fillStyle(separator, 0.4).fillRect(r.x, r.y + r.h / 2, r.w, 1);
        continue;
      }

      if (i === 3) {
        // Reset button - danger styling
        this.modalGfx.fillStyle(buttonDanger, over ? 0.28 : 0.14).fillRect(r.x, r.y, r.w, r.h);
        this.modalGfx.lineStyle(1, buttonDanger, over ? 0.9 : 0.55).strokeRect(r.x, r.y, r.w, r.h);
      } else {
        // Normal row - default styling with hover
        this.modalGfx.fillStyle(buttonDefault, over ? 0.2 : 0.08).fillRect(r.x, r.y, r.w, r.h);
        this.modalGfx.lineStyle(1, buttonDefault, over ? 0.8 : 0.3).strokeRect(r.x, r.y, r.w, r.h);
      }
    }

    // Show all settings texts
    this.settingsRowTexts.forEach((t) => t.setVisible(true));
  }

  private get modalOpen(): boolean {
    return this.helpOpen || this.settingsOpen;
  }

  private drawButton(g: Phaser.GameObjects.Graphics, b: { x: number; y: number; w: number; h: number }, over: boolean, color: number): void {
    g.fillStyle(color, over ? 0.3 : 0.14).fillRect(b.x, b.y, b.w, b.h);
    g.lineStyle(1, color, over ? 0.95 : 0.55).strokeRect(b.x, b.y, b.w, b.h);
  }

}
