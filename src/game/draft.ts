import { TileMap } from '../core/physics';
import { BoxSpec, ButtonSpec, PhaseSpec } from '../core/world';
import { TILE } from '../core/types';
import {
  BUTTON_H,
  COLS,
  DeviceKind,
  Device,
  LevelDef,
  ROWS,
  monolith,
  padRect,
  spring,
} from './level';

/**
 * A level as the editor holds it: tile coordinates and nothing else, so it can be
 * saved as JSON, replayed, and printed as the source of a `build…` function.
 */
export interface Draft {
  name: string;
  /** ROWS strings of COLS characters, '#' for wall. */
  rows: string[];
  spawn: { cx: number; row: number };
  exit: { cx: number; row: number };
  crates: { cx: number; row: number }[];
  /** The standard 4x3 stone, hung at row 2 and let go at its tick. */
  monoliths: { cx: number; tick: number }[];
  pads: { kind: DeviceKind; cx: number; row: number }[];
  buttons: { cx: number; row: number; group: number }[];
  phase: { cx: number; cy: number; group: number; inverted: boolean }[];
  hazards: { cx: number; cy: number }[];
  springs: { cx: number; row: number }[];
}

const PORTER_LABEL: Record<DeviceKind, string> = {
  chronoporter: 'CHRONOPORTER',
  anachroverter: 'ANACHROVERTER',
  chronoclast: 'CHRONOCLAST',
};

/** A fresh draft: the corridor every level starts from — a floor and two walls. */
export function blankDraft(): Draft {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let row = '';
    for (let x = 0; x < COLS; x++) {
      row += y >= 15 || x === 0 || x === COLS - 1 ? '#' : '.';
    }
    rows.push(row);
  }
  return {
    name: 'Untitled',
    rows,
    spawn: { cx: 2, row: 15 },
    exit: { cx: 40, row: 15 },
    crates: [],
    monoliths: [],
    pads: [],
    buttons: [],
    phase: [],
    hazards: [],
    springs: [],
  };
}

/** The playable level a draft describes. */
export function draftToLevel(d: Draft): LevelDef {
  const map = new TileMap(d.rows);
  const devices: Device[] = d.pads.map((p) => ({
    kind: p.kind,
    rect: padRect(p.cx, p.row),
    label: PORTER_LABEL[p.kind],
  }));
  const boxes: BoxSpec[] = [
    ...d.crates.map((c) => ({ x: c.cx * TILE, y: c.row * TILE - 28, w: 28, h: 28 })),
    ...d.monoliths.map((m) => monolith(m.cx, m.tick)),
  ];
  const buttons: ButtonSpec[] = d.buttons.map((b) => ({
    rect: { x: b.cx * TILE, y: b.row * TILE - BUTTON_H, w: TILE, h: BUTTON_H },
    group: b.group,
  }));
  const phase: PhaseSpec[] = d.phase.map((p) => ({
    rect: { x: p.cx * TILE, y: p.cy * TILE, w: TILE, h: TILE },
    group: p.group,
    inverted: p.inverted,
  }));
  return {
    name: d.name,
    brief: '',
    map,
    spawn: { x: d.spawn.cx * TILE, y: d.spawn.row * TILE - 28 },
    boxes,
    devices,
    buttons,
    phase,
    hazards: d.hazards.map((h) => ({ x: h.cx * TILE, y: h.cy * TILE, w: TILE, h: TILE })),
    springs: d.springs.map((sp) => spring(sp.cx, sp.row)),
    exit: { x: (d.exit.cx + 0.5) * TILE, y: d.exit.row * TILE - 26, r: 22 },
  };
}

/** An identifier for the build function: "Deep Water" becomes buildDeepWater. */
function fnName(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const camel = parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
  return `build${camel || 'Untitled'}`;
}

/**
 * Walls as the fewest `fill` calls that reproduce them: whole rows first, then
 * runs within a row, so the printed source reads like something a person wrote
 * rather than a dump of every tile.
 */
function wallCode(rows: string[]): string[] {
  const grid = rows.map((r) => r.split(''));
  const out: string[] = [];
  const floorFrom = rows.findIndex((r, y) => y > 0 && r === '#'.repeat(COLS));
  if (floorFrom >= 0) {
    let last = floorFrom;
    while (last + 1 < ROWS && rows[last + 1] === '#'.repeat(COLS)) last++;
    out.push(`  fill(grid, 0, ${floorFrom}, COLS - 1, ${last}); // floor`);
    for (let y = floorFrom; y <= last; y++) grid[y].fill('.');
  }
  // Full-height columns at the edges read as walls.
  for (const x of [0, COLS - 1]) {
    let y = 0;
    while (y < ROWS && grid[y][x] === '#') y++;
    if (y > 1) {
      const col = x === 0 ? '0' : 'COLS - 1';
      out.push(`  fill(grid, ${col}, 0, ${col}, ${y - 1}); // ${x === 0 ? 'left' : 'right'} wall`);
      for (let i = 0; i < y; i++) grid[i][x] = '.';
    }
  }
  for (let y = 0; y < ROWS; y++) {
    let x = 0;
    while (x < COLS) {
      if (grid[y][x] !== '#') {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < COLS && grid[y][end + 1] === '#') end++;
      out.push(`  fill(grid, ${x}, ${y}, ${end}, ${y});`);
      x = end + 1;
    }
  }
  return out;
}

interface PhaseRect {
  group: number;
  inverted: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Single phase tiles gathered back into rectangles, so a wall drawn tile by tile
 * prints as the one `phaseBlocks` call an author would have written: rows merged
 * across, then identical rows stacked.
 */
function phaseRects(tiles: Draft['phase']): PhaseRect[] {
  const out: PhaseRect[] = [];
  const seen = new Set<string>();
  const key = (t: { cx: number; cy: number; group: number; inverted: boolean }): string =>
    `${t.group}:${t.inverted}:${t.cx}:${t.cy}`;
  const has = (group: number, inverted: boolean, cx: number, cy: number): boolean =>
    tiles.some((t) => t.group === group && t.inverted === inverted && t.cx === cx && t.cy === cy) &&
    !seen.has(`${group}:${inverted}:${cx}:${cy}`);

  for (const t of tiles) {
    if (seen.has(key(t))) continue;
    let x1 = t.cx;
    while (has(t.group, t.inverted, x1 + 1, t.cy)) x1++;
    let y1 = t.cy;
    while (
      Array.from({ length: x1 - t.cx + 1 }, (_, i) => t.cx + i).every((x) =>
        has(t.group, t.inverted, x, y1 + 1),
      )
    ) {
      y1++;
    }
    for (let y = t.cy; y <= y1; y++) {
      for (let x = t.cx; x <= x1; x++) seen.add(`${t.group}:${t.inverted}:${x}:${y}`);
    }
    out.push({ group: t.group, inverted: t.inverted, x0: t.cx, y0: t.cy, x1, y1 });
  }
  return out;
}

function list(items: string[]): string {
  return items.length === 0 ? '[]' : `[${items.join(', ')}]`;
}

/** The draft as the source of a level function, ready to paste into level.ts. */
export function draftToCode(d: Draft): string {
  const fn = fnName(d.name);
  const boxes = [
    ...d.crates.map((c) => `{ x: ${c.cx} * TILE, y: ${c.row} * TILE - 28, w: 28, h: 28 }`),
    ...d.monoliths.map((m) => `monolith(${m.cx}, ${m.tick})`),
  ];
  const pads = d.pads.map((p) => `pad('${p.kind}', ${p.cx}, ${p.row}, '${PORTER_LABEL[p.kind]}')`);
  const buttons = d.buttons.map((b) => `button(${b.cx}, ${b.row}, ${b.group})`);
  const phase = phaseRects(d.phase).map(
    (r) => `...phaseBlocks(${r.group}, ${r.x0}, ${r.y0}, ${r.x1}, ${r.y1}${r.inverted ? ', true' : ''})`,
  );
  const hazards = d.hazards.map(
    (h) => `{ x: ${h.cx} * TILE, y: ${h.cy} * TILE, w: TILE, h: TILE }`,
  );
  const springs = d.springs.map((sp) => `spring(${sp.cx}, ${sp.row})`);

  const lines = [
    '/** Add this to LEVELS, and write a comment here saying what the level asks of the player. */',
    `function ${fn}(): LevelDef {`,
    '  const grid = blankGrid();',
    ...wallCode(d.rows),
    '  const map = new TileMap(grid.map((r) => r.join(\'\')));',
    '',
    '  return {',
    `    name: '${d.name.replace(/'/g, "\\'")}',`,
    `    brief: '',`,
    '    map,',
    `    spawn: { x: ${d.spawn.cx} * TILE, y: ${d.spawn.row} * TILE - 28 },`,
    `    boxes: ${list(boxes)},`,
    `    devices: ${list(pads)},`,
    `    buttons: ${list(buttons)},`,
    `    phase: ${list(phase)},`,
    `    hazards: ${list(hazards)},`,
    `    springs: ${list(springs)},`,
    `    exit: { x: ${d.exit.cx + 0.5} * TILE, y: ${d.exit.row} * TILE - 26, r: 22 },`,
    '  };',
    '}',
  ];
  return lines.join('\n');
}

const STORE = 'chronostrophe:draft';

export function saveDraft(d: Draft): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(d));
  } catch {
    // A browser refusing storage is not a reason to stop editing.
  }
}

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return { ...blankDraft(), ...(JSON.parse(raw) as Draft) };
  } catch {
    // A corrupt draft is discarded rather than blocking the editor.
  }
  return blankDraft();
}
