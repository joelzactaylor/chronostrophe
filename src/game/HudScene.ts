import Phaser from 'phaser';
import { TICKS, clamp } from '../core/types';
import { GameScene, VIEW_H, VIEW_W } from './GameScene';
import { sfx } from './audio';
import {
  COL_PANEL_BG,
  COL_HUD_BORDER,
  COL_BUTTON_DEFAULT,
  COL_BUTTON_DANGER,
  COL_TRACK_BG,
  COL_TRACK_TICK,
  COL_TRACK_HISTORY,
  COL_TRACK_CURRENT,
  COL_TRACK_CURRENT_PAUSED,
  COL_TRACK_DOT,
  COL_TRACK_DOT_SCRUB,
  COL_TRACK_ARROW,
  COL_TRACK_END,
  COL_TRACK_MARKER,
  COL_TEXT_PRIMARY,
  COL_TEXT_SECONDARY,
  COL_MODAL_BG,
  TEXT_HIGHLIGHT,
} from './theme';

const TRACK_X = 120;
const TRACK_W = VIEW_W - 200;
const TRACK_Y = VIEW_H + 58;
const PANEL_H = 96;

type Button = { x: number; y: number; w: number; h: number };

/** "Give up on this run": the way out of a level that has walled itself off. */
const ABANDON: Button = { x: VIEW_W - 132, y: VIEW_H + 8, w: 116, h: 24 };
const MENU: Button = { x: VIEW_W - 226, y: VIEW_H + 8, w: 86, h: 24 };
const SOUND: Button = { x: VIEW_W - 300, y: VIEW_H + 8, w: 66, h: 24 };

function hit(b: Button, p: Phaser.Input.Pointer): boolean {
  return p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;
}

export class HudScene extends Phaser.Scene {
  private gfx!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private clock!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private abandon!: Phaser.GameObjects.Text;
  private menu!: Phaser.GameObjects.Text;
  private soundBtn!: Phaser.GameObjects.Text;
  private anomaly!: Phaser.GameObjects.Text;
  private dragging = false;

  constructor() {
    super('hud');
  }

  private get game_(): GameScene {
    return this.scene.get('game') as GameScene;
  }

  create(): void {
    this.gfx = this.add.graphics();
    const primary = COL_TEXT_PRIMARY();
    const primaryCss = `#${primary.toString(16).padStart(6, '0')}`;
    const font = { fontFamily: 'monospace', fontSize: '14px', color: primaryCss };
    this.status = this.add.text(16, VIEW_H + 10, '', font);
    this.clock = this.add.text(VIEW_W - 78, TRACK_Y - 9, '', { ...font, color: '#f7e26b' });
    this.banner = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 20, '', {
        fontFamily: 'monospace',
        fontSize: '34px',
        color: '#ffffff',
        align: 'center',
      })
      .setOrigin(0.5);
    const accent = COL_TEXT_SECONDARY();
    const accentCss = `#${accent.toString(16).padStart(6, '0')}`;
    this.hint = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 26, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: accentCss,
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
        color: accentCss,
      })
      .setOrigin(0.5);

    this.soundBtn = this.add
      .text(SOUND.x + SOUND.w / 2, SOUND.y + SOUND.h / 2, '', {
        ...font,
        fontSize: '12px',
        color: accentCss,
      })
      .setOrigin(0.5);

    this.anomaly = this.add
      .text(VIEW_W / 2, VIEW_H - 34, '', {
        ...font,
        fontSize: '13px',
        color: '#ff8fa3',
      })
      .setOrigin(0.5);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (hit(ABANDON, p)) {
        this.game_.abandonRun();
        return;
      }
      if (hit(SOUND, p)) {
        sfx.unlock();
        sfx.toggleMute();
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

    const panelBg = COL_PANEL_BG();
    const hudBorder = COL_HUD_BORDER();
    const buttonDefault = COL_BUTTON_DEFAULT();
    const buttonDanger = COL_BUTTON_DANGER();
    const trackBg = COL_TRACK_BG();
    const trackTick = COL_TRACK_TICK();
    const trackHistory = COL_TRACK_HISTORY();
    const trackCurrent = COL_TRACK_CURRENT();
    const trackCurrentPaused = COL_TRACK_CURRENT_PAUSED();
    const trackDot = COL_TRACK_DOT();
    const trackDotScrub = COL_TRACK_DOT_SCRUB();
    const trackArrow = COL_TRACK_ARROW();
    const trackEnd = COL_TRACK_END();
    const trackMarker = COL_TRACK_MARKER();
    const primary = COL_TEXT_PRIMARY();
    const secondary = COL_TEXT_SECONDARY();
    const modalBg = COL_MODAL_BG();
    const highlight = TEXT_HIGHLIGHT();
    const primaryCss = `#${primary.toString(16).padStart(6, '0')}`;
    const secondaryCss = `#${secondary.toString(16).padStart(6, '0')}`;

    g.fillStyle(panelBg, 1).fillRect(0, VIEW_H, VIEW_W, PANEL_H);
    g.fillStyle(hudBorder, 0.6).fillRect(0, VIEW_H, VIEW_W, 2);

    const p = this.input.activePointer;
    const overAbandon = hit(ABANDON, p);
    g.fillStyle(buttonDanger, overAbandon ? 0.28 : 0.14).fillRect(ABANDON.x, ABANDON.y, ABANDON.w, ABANDON.h);
    g.lineStyle(1, buttonDanger, overAbandon ? 0.9 : 0.55).strokeRect(ABANDON.x, ABANDON.y, ABANDON.w, ABANDON.h);
    this.abandon.setColor(overAbandon ? highlight : '#ffb3c1');

    const overSound = hit(SOUND, p);
    g.fillStyle(buttonDefault, overSound ? 0.3 : 0.14).fillRect(SOUND.x, SOUND.y, SOUND.w, SOUND.h);
    g.lineStyle(1, buttonDefault, overSound ? 0.9 : 0.55).strokeRect(SOUND.x, SOUND.y, SOUND.w, SOUND.h);
    this.soundBtn.setText(sfx.isMuted ? 'MUTED [M]' : 'SOUND [M]');
    this.soundBtn.setColor(sfx.isMuted ? secondaryCss : overSound ? highlight : primaryCss);

    const overMenu = hit(MENU, p);
    g.fillStyle(buttonDefault, overMenu ? 0.3 : 0.14).fillRect(MENU.x, MENU.y, MENU.w, MENU.h);
    g.lineStyle(1, buttonDefault, overMenu ? 0.9 : 0.55).strokeRect(MENU.x, MENU.y, MENU.w, MENU.h);
    this.menu.setColor(overMenu ? highlight : primaryCss);

    // Track background (drawn first so coloured segments sit on top)
    g.fillStyle(trackBg, 1).fillRect(TRACK_X, TRACK_Y - 3, TRACK_W, 6);
    for (let i = 0; i <= 12; i++) {
      const x = TRACK_X + (i / 12) * TRACK_W;
      g.fillStyle(trackTick, 1).fillRect(x, TRACK_Y - 8, 1, 16);
    }

    // recorded history coverage (drawn on top of the track)
    for (const run of w.runs) {
      const a = TRACK_X + (run.tMin / TICKS) * TRACK_W;
      const b = TRACK_X + (run.tMax / TICKS) * TRACK_W;
      g.fillStyle(trackHistory, 0.35).fillRect(a, TRACK_Y - 2, Math.max(2, b - a), 5);
    }
    const cur = w.current;
    if (cur.tMax > cur.tMin) {
      const a = TRACK_X + (cur.tMin / TICKS) * TRACK_W;
      const b = TRACK_X + (cur.tMax / TICKS) * TRACK_W;
      // When the timeline is paused (player on a device), the current run's
      // recorded segment is all past — shown in blue like closed runs, not
      // yellow like an active present.
      const color = w.paused ? trackCurrentPaused : trackCurrent;
      g.fillStyle(color, w.paused ? 0.35 : 0.5).fillRect(a, TRACK_Y - 2, Math.max(2, b - a), 5);
    }

    // Monolith-fall markers: a small grey square above the track, one per
    // immovable box that drops at a set tick.
    for (const box of w.boxes) {
      if (!box.immovable || box.releaseTick <= 0) continue;
      const mx = TRACK_X + (box.releaseTick / TICKS) * TRACK_W;
      g.fillStyle(trackMarker, 1.0).fillRect(mx - 4, TRACK_Y - 14, 8, 8);
    }

    // Anomaly markers: pulsing diamond shapes below the track, one per anomaly
    // currently chasing the player, drawn at the timeline tick they occupy so it
    // reads as where the contradiction is.
    const anomalyTicks = scene.anomalyTimelineTicks();
    const anomalyPulse = 0.55 + 0.45 * Math.sin(this.time.now / 180);
    for (const tick of anomalyTicks) {
      const ax = TRACK_X + (tick / TICKS) * TRACK_W;
      g.fillStyle(0xff4d6d, 0.35 + 0.4 * anomalyPulse);
      g.fillTriangle(ax, TRACK_Y + 14, ax - 5, TRACK_Y + 22, ax + 5, TRACK_Y + 22);
      g.fillTriangle(ax, TRACK_Y + 30, ax - 5, TRACK_Y + 22, ax + 5, TRACK_Y + 22);
      g.fillStyle(0xff4d6d, 0.2 * anomalyPulse);
      g.fillCircle(ax, TRACK_Y + 22, 3 + 4 * anomalyPulse);
    }

    g.fillStyle(trackEnd, 0.9).fillRect(TRACK_X - 3, TRACK_Y - 12, 3, 24);
    g.fillStyle(trackEnd, 0.9).fillRect(TRACK_X + TRACK_W, TRACK_Y - 12, 3, 24);

    const dotX = TRACK_X + (w.now / TICKS) * TRACK_W;
    const live = scene.canScrub();
    g.fillStyle(live ? trackDotScrub : trackDot, 0.3).fillCircle(dotX, TRACK_Y, 14);
    g.fillStyle(live ? trackDotScrub : trackDot, 1).fillCircle(dotX, TRACK_Y, 8);
    g.fillStyle(modalBg, 1).fillCircle(dotX, TRACK_Y, 3);

    // The direction of time, drawn only while time is going anywhere.
    if (!w.paused) {
      const ax = 92;
      const s = w.dir;
      g.fillStyle(trackArrow, 1);
      g.fillRect(ax - 22, TRACK_Y - 2, 30, 4);
      g.fillTriangle(
        ax + (s === 1 ? 8 : -22),
        TRACK_Y - 9,
        ax + (s === 1 ? 8 : -22),
        TRACK_Y + 9,
        ax + (s === 1 ? 22 : -36),
        TRACK_Y,
      );
    }

    const secs = (w.now / 60).toFixed(2);
    this.clock.setText(`T ${secs}s`);
    // The name of the level; no brief, because where a stone falls is the puzzle.
    const level = `${scene.levelIndex + 1}. ${scene.level.name.toUpperCase()}`;
    // Whatever just happened, or - while stood on a pad - how that pad is worked.
    const said = scene.message || scene.deviceHint();
    this.status.setText(said ? `${level}    ·    ${said}` : level);

    // How much lived time is left before an anomaly reaches the present.
    const lead = scene.anomalyLead();
    if (lead === null) {
      this.anomaly.setText('');
    } else {
      const left = (lead / 120).toFixed(2);
      this.anomaly.setText(`ANOMALY CLOSING — ${left}s OF YOUR OWN PATH LEFT`);
      const urgency = 1 - Math.min(1, lead / 120);
      this.anomaly.setColor(`hsl(350, 100%, ${50 + 25 * (1 - urgency)}%)`);
    }

    this.drawOverlay(scene);
  }

  private drawOverlay(scene: GameScene): void {
    const g = this.gfx;
    const modalBg = COL_MODAL_BG();
    switch (scene.state) {
      case 'won': {
        // Nothing over the top of the gate taking the body: the banner waits for it.
        if (!scene.captureDone) {
          this.banner.setText('');
          this.hint.setText('');
          break;
        }
        g.fillStyle(modalBg, 0.72).fillRect(0, 0, VIEW_W, VIEW_H);
        this.banner.setText('TIMELINE RESOLVED').setColor('#f7e26b');
        this.hint.setText(scene.hasNextLevel ? '[ENTER] next level' : '[ENTER] return to menu');
        break;
      }
      case 'dust':
        this.banner.setText('THE UNIVERSE ENDS').setColor('#d6b3ff');
        this.hint.setText(scene.message);
        break;
      case 'fisheye':
        this.banner.setText('PARADOX COLLAPSE').setColor('#ff4d6d');
        this.hint.setText(scene.message);
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
