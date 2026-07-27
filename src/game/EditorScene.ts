import Phaser from 'phaser';
import { COLS, DeviceKind, ROWS } from './level';
import { Draft, blankDraft, draftToCode, draftToLevel, loadDraft, saveDraft } from './draft';
import { VIEW_H, VIEW_W } from './GameScene';
import { TILE } from '../core/types';
import { fadeIn, fadeOutThen } from './transition';
import { sfx } from './audio';

type Tool =
  | 'wall'
  | 'erase'
  | 'spawn'
  | 'gate'
  | 'crate'
  | 'monolith'
  | 'chronoporter'
  | 'anachroverter'
  | 'chronoclast'
  | 'hazard'
  | 'button'
  | 'phase'
  | 'phaseInv';

const TOOLS: { tool: Tool; key: string; label: string }[] = [
  { tool: 'wall', key: '1', label: 'WALL' },
  { tool: 'erase', key: '2', label: 'ERASE' },
  { tool: 'spawn', key: '3', label: 'SPAWN' },
  { tool: 'gate', key: '4', label: 'GATE' },
  { tool: 'crate', key: '5', label: 'CRATE' },
  { tool: 'monolith', key: '6', label: 'MONOLITH' },
  { tool: 'chronoporter', key: '7', label: 'PORTER' },
  { tool: 'anachroverter', key: '8', label: 'ANACHRO' },
  { tool: 'chronoclast', key: '9', label: 'CLAST' },
  { tool: 'hazard', key: '0', label: 'SPIKES' },
  { tool: 'button', key: 'B', label: 'BUTTON' },
  { tool: 'phase', key: 'P', label: 'PHASE' },
  { tool: 'phaseInv', key: 'O', label: 'PHASE-INV' },
];

const GROUP_COLOURS = [0xff9d3d, 0x76d9ff, 0x9dff6b, 0xff6bd6];

const UI_H = 96;
const MAP_W = COLS * TILE;
const MAP_H = ROWS * TILE;
const ZOOM = VIEW_W / MAP_W;

/**
 * The level editor: a tile canvas over the same data a level function holds, so a
 * drawing can be played straight away and printed as the source of that function.
 * Reached from the menu with the editor code; it is not part of the game proper.
 */
export class EditorScene extends Phaser.Scene {
  private draft: Draft = blankDraft();
  private tool: Tool = 'wall';
  private group = 0;
  private tick = 150;
  private gfx!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private toolTexts: Phaser.GameObjects.Text[] = [];
  private overlay: HTMLDivElement | null = null;
  private painting = false;
  private hover: { cx: number; cy: number } | null = null;

  constructor() {
    super('editor');
  }

  create(): void {
    this.scene.stop('hud');
    this.draft = loadDraft();
    fadeIn(this);

    const cam = this.cameras.main;
    cam.setViewport(0, 0, VIEW_W, VIEW_H);
    cam.setBackgroundColor(0x0b0714);
    cam.setZoom(ZOOM);
    cam.centerOn(MAP_W / 2, MAP_H / 2);

    this.gfx = this.add.graphics();

    const uiCam = this.cameras.add(0, VIEW_H, VIEW_W, UI_H);
    uiCam.setBackgroundColor(0x08040f);
    this.ui = this.add.graphics();
    const font = { fontFamily: 'monospace', fontSize: '11px', color: '#cfd8ff' };
    this.toolTexts = TOOLS.map((t, i) =>
      this.add.text(12 + (i % 7) * 134, 10 + Math.floor(i / 7) * 18, `[${t.key}] ${t.label}`, font),
    );
    this.status = this.add.text(12, 52, '', { ...font, color: '#8892bd', lineSpacing: 3 });

    cam.ignore([this.ui, this.status, ...this.toolTexts]);
    uiCam.ignore(this.gfx);

    this.bindKeys();
    this.bindPointer();
  }

  private bindKeys(): void {
    const kb = this.input.keyboard!;
    for (const t of TOOLS) kb.on(`keydown-${t.key === '0' ? 'ZERO' : keyName(t.key)}`, () => this.pick(t.tool));
    kb.on('keydown-G', () => (this.group = (this.group + 1) % GROUP_COLOURS.length));
    kb.on('keydown-OPEN_BRACKET', () => (this.tick = Math.max(0, this.tick - 30)));
    kb.on('keydown-CLOSED_BRACKET', () => (this.tick = Math.min(3600, this.tick + 30)));
    kb.on('keydown-T', () => this.test());
    kb.on('keydown-X', () => this.showCode());
    kb.on('keydown-N', () => {
      if (window.confirm('Clear the level and start again?')) this.commit(blankDraft());
    });
    kb.on('keydown-F2', () => this.rename());
    kb.on('keydown-ESC', () => {
      if (this.overlay) {
        this.closeCode();
        return;
      }
      saveDraft(this.draft);
      fadeOutThen(this, 200, () => this.scene.start('menu'));
    });
    kb.on('keydown', () => sfx.unlock());
  }

  private bindPointer(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y >= VIEW_H) return;
      this.painting = true;
      this.apply(p, p.rightButtonDown());
    });
    this.input.on('pointerup', () => {
      this.painting = false;
      saveDraft(this.draft);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.hover = p.y < VIEW_H ? this.tileAt(p) : null;
      if (this.painting && p.y < VIEW_H) this.apply(p, p.rightButtonDown());
    });
  }

  private pick(tool: Tool): void {
    this.tool = tool;
    sfx.menuMove();
  }

  private tileAt(p: Phaser.Input.Pointer): { cx: number; cy: number } {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    return {
      cx: Phaser.Math.Clamp(Math.floor(w.x / TILE), 0, COLS - 1),
      cy: Phaser.Math.Clamp(Math.floor(w.y / TILE), 0, ROWS - 1),
    };
  }

  /** Puts the current tool at the clicked tile, or clears that tile on a right-click. */
  private apply(p: Phaser.Input.Pointer, erasing: boolean): void {
    const { cx, cy } = this.tileAt(p);
    const d = this.draft;
    if (erasing || this.tool === 'erase') {
      this.clearTile(cx, cy);
      return;
    }
    // A tile is one thing at a time; whatever was there makes way.
    if (this.tool !== 'wall') this.clearTile(cx, cy);
    const row = cy + 1;
    switch (this.tool) {
      case 'wall':
        this.setWall(cx, cy, true);
        break;
      case 'spawn':
        d.spawn = { cx, row };
        break;
      case 'gate':
        d.exit = { cx, row };
        break;
      case 'crate':
        d.crates.push({ cx, row });
        break;
      case 'monolith':
        d.monoliths.push({ cx, tick: this.tick });
        break;
      case 'chronoporter':
      case 'anachroverter':
      case 'chronoclast':
        d.pads.push({ kind: this.tool as DeviceKind, cx, row });
        break;
      case 'hazard':
        d.hazards.push({ cx, cy });
        break;
      case 'button':
        d.buttons.push({ cx, row, group: this.group });
        break;
      case 'phase':
      case 'phaseInv':
        d.phase.push({ cx, cy, group: this.group, inverted: this.tool === 'phaseInv' });
        break;
    }
  }

  private setWall(cx: number, cy: number, on: boolean): void {
    const row = this.draft.rows[cy].split('');
    row[cx] = on ? '#' : '.';
    this.draft.rows[cy] = row.join('');
  }

  /** Removes whatever occupies a tile, walls last: one click, one thing gone. */
  private clearTile(cx: number, cy: number): void {
    const d = this.draft;
    const before = [d.crates.length, d.monoliths.length, d.pads.length, d.buttons.length, d.phase.length, d.hazards.length];
    d.crates = d.crates.filter((c) => !(c.cx === cx && c.row === cy + 1));
    d.monoliths = d.monoliths.filter((m) => !(cx >= m.cx && cx < m.cx + 4 && cy >= 2 && cy < 5));
    d.pads = d.pads.filter((p) => !(p.cx === cx && p.row === cy + 1));
    d.buttons = d.buttons.filter((b) => !(b.cx === cx && b.row === cy + 1));
    d.phase = d.phase.filter((p) => !(p.cx === cx && p.cy === cy));
    d.hazards = d.hazards.filter((h) => !(h.cx === cx && h.cy === cy));
    const after = [d.crates.length, d.monoliths.length, d.pads.length, d.buttons.length, d.phase.length, d.hazards.length];
    if (before.every((n, i) => n === after[i])) this.setWall(cx, cy, false);
  }

  private commit(d: Draft): void {
    this.draft = d;
    saveDraft(d);
  }

  private rename(): void {
    const name = window.prompt('Level name', this.draft.name);
    if (name) {
      this.draft.name = name.trim() || this.draft.name;
      saveDraft(this.draft);
    }
  }

  /** Plays the draft as it stands; the game comes back here on ESC or the gate. */
  private test(): void {
    saveDraft(this.draft);
    sfx.menuSelect();
    fadeOutThen(this, 180, () => this.scene.start('game', { draft: draftToLevel(this.draft) }));
  }

  private showCode(): void {
    if (this.overlay) return;
    const code = draftToCode(this.draft);
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;inset:0;background:rgba(5,3,10,0.92);display:flex;flex-direction:column;' +
      'gap:8px;padding:24px;font-family:monospace;color:#cfd8ff;z-index:10';
    const head = document.createElement('div');
    head.textContent = 'Paste this into src/game/level.ts, then add the function to LEVELS.';
    const area = document.createElement('textarea');
    area.value = code;
    area.readOnly = true;
    area.style.cssText =
      'flex:1;background:#0b0714;color:#cfd8ff;border:1px solid #6d4bd6;padding:12px;' +
      'font-family:monospace;font-size:12px;resize:none';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px';
    const copy = button('COPY', () => {
      area.select();
      void navigator.clipboard?.writeText(code);
      copy.textContent = 'COPIED';
    });
    const close = button('CLOSE [ESC]', () => this.closeCode());
    bar.append(copy, close);
    wrap.append(head, area, bar);
    document.body.append(wrap);
    this.overlay = wrap;
    area.focus();
    area.select();
  }

  private closeCode(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  override update(): void {
    this.drawMap();
    this.drawUi();
  }

  private drawMap(): void {
    const g = this.gfx;
    const d = this.draft;
    g.clear();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = x * TILE;
        const py = y * TILE;
        if (d.rows[y][x] === '#') {
          g.fillStyle(0x241a44, 1).fillRect(px, py, TILE, TILE);
          g.fillStyle(0x6d4bd6, 0.5).fillRect(px, py, TILE, 2);
        } else {
          g.lineStyle(1, 0x2a2350, 0.5).strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        }
      }
    }

    for (const p of d.phase) {
      const c = GROUP_COLOURS[p.group % GROUP_COLOURS.length];
      if (p.inverted) {
        g.fillStyle(c, 0.12).fillRect(p.cx * TILE, p.cy * TILE, TILE, TILE);
        g.lineStyle(2, c, 0.8).strokeRect(p.cx * TILE + 2, p.cy * TILE + 2, TILE - 4, TILE - 4);
      } else {
        g.fillStyle(c, 0.85).fillRect(p.cx * TILE + 1, p.cy * TILE + 1, TILE - 2, TILE - 2);
      }
    }

    for (const b of d.buttons) {
      const c = GROUP_COLOURS[b.group % GROUP_COLOURS.length];
      g.fillStyle(c, 0.9).fillRect(b.cx * TILE + 3, b.row * TILE - 7, TILE - 6, 6);
      g.fillStyle(c, 0.15).fillRect(b.cx * TILE, b.row * TILE - 20, TILE, 20);
    }

    for (const h of d.hazards) {
      g.fillStyle(0x93a2c4, 0.9);
      for (let i = 0; i < 4; i++) {
        const x = h.cx * TILE + i * 8;
        g.fillTriangle(x, (h.cy + 1) * TILE, x + 8, (h.cy + 1) * TILE, x + 4, h.cy * TILE);
      }
    }

    for (const c of d.crates) {
      g.fillStyle(0xd98b45, 1).fillRect(c.cx * TILE, c.row * TILE - 28, 28, 28);
      g.lineStyle(1, 0x000000, 0.4).strokeRect(c.cx * TILE, c.row * TILE - 28, 28, 28);
    }

    for (const m of d.monoliths) {
      g.fillStyle(0x3b2f66, 1).fillRect(m.cx * TILE, 2 * TILE, 4 * TILE, 3 * TILE);
      g.lineStyle(2, 0x8f7de0, 0.9).strokeRect(m.cx * TILE, 2 * TILE, 4 * TILE, 3 * TILE);
      // The corridor it will occupy once it is let go, so the drop is visible while drawing.
      g.fillStyle(0x8f7de0, 0.06).fillRect(m.cx * TILE, 5 * TILE, 4 * TILE, MAP_H - 5 * TILE);
    }

    for (const p of d.pads) {
      const c = p.kind === 'anachroverter' ? 0xff8fd0 : p.kind === 'chronoclast' ? 0xff6b6b : 0x76d9ff;
      const h = 34;
      g.fillStyle(c, 0.18).fillRect(p.cx * TILE, p.row * TILE - h, TILE, h);
      g.fillStyle(c, 0.9).fillRect(p.cx * TILE, p.row * TILE - 4, TILE, 4);
    }

    g.fillStyle(0xf7e26b, 1).fillRect(d.spawn.cx * TILE + 6, d.spawn.row * TILE - 28, 20, 28);

    g.fillStyle(0x000000, 1).fillCircle((d.exit.cx + 0.5) * TILE, d.exit.row * TILE - 26, 22);
    g.lineStyle(2, 0xd6b3ff, 0.9).strokeCircle((d.exit.cx + 0.5) * TILE, d.exit.row * TILE - 26, 22);

    if (this.hover) {
      g.lineStyle(1, 0xffffff, 0.6).strokeRect(this.hover.cx * TILE, this.hover.cy * TILE, TILE, TILE);
    }
  }

  private drawUi(): void {
    const g = this.ui;
    g.clear();
    g.lineStyle(1, 0x6d4bd6, 0.5).strokeRect(4, 4, VIEW_W - 8, UI_H - 8);
    TOOLS.forEach((t, i) => {
      const on = t.tool === this.tool;
      const x = 8 + (i % 7) * 134;
      const y = 6 + Math.floor(i / 7) * 18;
      g.fillStyle(0x6d4bd6, on ? 0.3 : 0.06).fillRect(x, y, 130, 17);
      this.toolTexts[i].setColor(on ? '#ffffff' : '#cfd8ff');
    });
    const c = GROUP_COLOURS[this.group];
    g.fillStyle(c, 0.9).fillRect(VIEW_W - 26, 8, 14, 14);
    this.status.setText(
      `${this.draft.name.toUpperCase()}   [F2] rename   [G] group ${this.group}   ` +
        `[ ] monolith tick ${this.tick}   [T] test   [X] export   [N] clear   [ESC] menu\n` +
        'left click places, right click clears the tile',
    );
  }
}

function keyName(key: string): string {
  const digits: Record<string, string> = {
    '1': 'ONE',
    '2': 'TWO',
    '3': 'THREE',
    '4': 'FOUR',
    '5': 'FIVE',
    '6': 'SIX',
    '7': 'SEVEN',
    '8': 'EIGHT',
    '9': 'NINE',
  };
  return digits[key] ?? key;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText =
    'background:#241a44;color:#cfd8ff;border:1px solid #6d4bd6;padding:8px 16px;' +
    'font-family:monospace;cursor:pointer';
  b.addEventListener('click', onClick);
  return b;
}
