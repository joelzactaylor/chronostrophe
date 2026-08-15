/**
 * Whether a shipped level survives being opened in the editor.
 *
 * `levelToDraft` resolves a built level back to tile coordinates and `draftToLevel`
 * builds it again; anything the editor cannot hold is lost in between. This walks
 * every level through the pair and reports what came back different, so loading one
 * to edit is known not to quietly rewrite it.
 */
import { COLS, LEVELS, ROWS } from '../../src/game/level';
import type { LevelDef } from '../../src/game/level';
import { draftToLevel, levelToDraft } from '../../src/game/draft';
import { argv } from './harness';

/** A level as comparable plain data, map included. */
function shape(l: LevelDef): Record<string, unknown> {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let r = '';
    for (let x = 0; x < COLS; x++) r += l.map.isSolid(x, y) ? '#' : '.';
    rows.push(r);
  }
  return {
    name: l.name,
    rows,
    spawn: l.spawn,
    exit: l.exit,
    boxes: l.boxes,
    devices: l.devices,
    buttons: l.buttons ?? [],
    phase: l.phase ?? [],
    hazards: l.hazards,
    hazardsInverted: l.hazardsInverted,
    springs: l.springs ?? [],
  };
}

/** The fields that differ, and how, one line each. */
function diff(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of Object.keys(a)) {
    const before = JSON.stringify(a[key]);
    const after = JSON.stringify(b[key]);
    if (before === after) continue;
    const count = (v: unknown): string => (Array.isArray(v) ? ` (${v.length} -> ${(b[key] as unknown[]).length})` : '');
    out.push(`    ${key}${count(a[key])}`);
    out.push(`      was  ${before.slice(0, 200)}`);
    out.push(`      now  ${after.slice(0, 200)}`);
  }
  return out;
}

const only = argv[0]?.toLowerCase();
let bad = 0;
for (const build of LEVELS) {
  const level = build();
  if (only && !level.name.toLowerCase().startsWith(only)) continue;
  const back = draftToLevel(levelToDraft(level));
  const lines = diff(shape(level), shape(back));
  if (lines.length === 0) {
    console.log(`  ok    ${level.name}`);
    continue;
  }
  bad++;
  console.log(`  DIFF  ${level.name}`);
  for (const l of lines) console.log(l);
}
console.log(bad === 0 ? '\nevery level survives a trip through the editor' : `\n${bad} level(s) changed`);
