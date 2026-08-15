/**
 * How a chain behaves as its far end goes over a ledge: what holds the falling
 * crates up, and what the crates that are falling do to the shove behind them.
 *
 *   npm run sim -- ledge-flow [stacks] [high]
 */
import { supportUnder } from '../../src/core/physics';
import type { SolidRect } from '../../src/core/physics';
import { GROUND_NONE, GROUND_TILE } from '../../src/core/types';
import { boxRect } from '../../src/core/world';
import type { Box } from '../../src/core/world';
import { argv, buildWorld, hold } from './harness';
import { SHELF_END, SHELF_ROW, ledgeScenario } from './scenarios';

const COUNT = Number(argv[0] ?? 5);
const HIGH = Number(argv[1] ?? 2);
const TICKS = Number(argv[2] ?? 460);
const EDGE = SHELF_END * 32;

const w = buildWorld(ledgeScenario(COUNT, 640, HIGH));

interface Row {
  t: number;
  speed: number;
  /** Crates whose footprint has left the shelf entirely. */
  overVoid: number[];
  /** Of those, the ones not descending: floating. */
  floating: { id: number; heldBy: number }[];
  ys: number[];
  xs: number[];
}

const api = w as unknown as { otherBoxSolids(b: Box): SolidRect[] };
const rows: Row[] = [];
let prevX = w.player.x;
let prevY = w.boxes.map((b) => b.state.y);

const held = (b: Box): number => supportUnder(boxRect(b), w.map, api.otherBoxSolids(b));

for (let t = 0; t < TICKS; t++) {
  w.step(hold({ right: true }));
  const overVoid: number[] = [];
  const floating: { id: number; heldBy: number }[] = [];
  for (const b of w.boxes) {
    if (b.state.x < EDGE) continue;
    overVoid.push(b.id);
    // Over the void and not actually descending: it is hanging on something.
    // Velocity is no use here — a crate riding one that is falling has its vy
    // zeroed every tick by the landing, so measure the ground it actually loses.
    if (b.state.y - (prevY[b.id] ?? b.state.y) < 0.01 && b.state.y + b.h < SHELF_ROW * 32 + 8) {
      floating.push({ id: b.id, heldBy: held(b) });
    }
  }
  rows.push({ t: t + 1, speed: w.player.x - prevX, overVoid, floating, ys: w.boxes.map((b) => b.state.y), xs: w.boxes.map((b) => b.state.x) });
  prevX = w.player.x;
  prevY = w.boxes.map((b) => b.state.y);
}

const name = (id: number): string =>
  id === GROUND_TILE ? 'tile' : id === GROUND_NONE ? 'nothing' : `crate#${id}`;

// Hang time: consecutive ticks a crate is over the void without descending.
const hang = new Map<number, number>();
const worstHang = new Map<number, number>();
for (const r of rows) {
  const floatingIds = new Set(r.floating.map((f) => f.id));
  for (const b of w.boxes) {
    const n = floatingIds.has(b.id) ? (hang.get(b.id) ?? 0) + 1 : 0;
    hang.set(b.id, n);
    worstHang.set(b.id, Math.max(worstHang.get(b.id) ?? 0, n));
  }
}

console.log(`${COUNT} stacks x ${HIGH} high, shelf edge at x=${EDGE}`);
console.log('\nlongest hang over the void, per crate (ticks held up by something while past the edge):');
for (const [id, n] of [...worstHang].sort((a, b) => b[1] - a[1])) {
  if (n > 0) console.log(`  crate#${id}: ${n} ticks`);
}

const shoving = rows.filter((r) => r.speed > 0.01 && r.speed < 3.5);
const base = shoving.length ? shoving.reduce((s, r) => s + r.speed, 0) / shoving.length : 0;
console.log(`\nmean body speed while shoving: ${base.toFixed(3)} px/tick`);
const stalls = rows.filter((r) => r.speed < 0.05 && r.t > 40 && r.t < TICKS - 40);
console.log(`ticks where the body is stalled (< 0.05px) mid-run: ${stalls.length}`);
if (stalls.length) {
  console.log(`  first ${stalls.slice(0, 12).map((r) => r.t).join(', ')}`);
}

const FROM = Number(argv[3] ?? 255);
console.log(`\nper-tick detail, t=${FROM}..${FROM + 26} (gap = how far the top crate trails the one under it):`);
console.log('   t  speed   ' + w.boxes.map((b) => `#${b.id}.${argv[4] === 'x' ? 'x' : 'y'}`.padStart(9)).join(''));
for (const r of rows) {
  if (r.t < FROM || r.t > FROM + 26) continue;
  console.log(
    `  ${String(r.t).padStart(3)} ${r.speed.toFixed(2).padStart(6)}   ` +
      (argv[4] === 'x' ? r.xs : r.ys).map((v) => v.toFixed(2).padStart(9)).join(''),
  );
}

console.log('\nticks where something is floating over the void:');
let shown = 0;
for (const r of rows) {
  if (r.floating.length === 0 || shown >= 400) continue;
  shown++;
  console.log(
    `  t=${String(r.t).padStart(3)} speed=${r.speed.toFixed(2)} ` +
      `floating: ${r.floating.map((f) => `${name(f.id)} held by ${name(f.heldBy)}`).join(', ')}`,
  );
}
