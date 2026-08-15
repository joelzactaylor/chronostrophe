/** The levels the headless checks are run against. */
import { crateAt } from './harness';
import type { Scenario } from './harness';
import type { BoxSpec } from '../../src/core/world';

export const COLS = 60;
export const ROWS = 30;
/** The shelf the crates start on, and the ledge they are shoved off. */
export const SHELF_ROW = 15;
export const SHELF_END = 30;
export const GROUND_ROW = 25;

export function ledgeMap(shelfEnd = SHELF_END): string[] {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let row = '';
    for (let x = 0; x < COLS; x++) {
      const shelf = y >= SHELF_ROW && y <= SHELF_ROW + 1 && x < shelfEnd;
      const ground = y >= GROUND_ROW;
      const wall = x === 0;
      row += shelf || ground || wall ? '#' : '.';
    }
    rows.push(row);
  }
  return rows;
}

/** `count` stacks of `high` crates, flush against one another on the shelf. */
export function stacks(count: number, startX: number, high = 2): BoxSpec[] {
  const boxes: BoxSpec[] = [];
  const floor = SHELF_ROW * 32;
  for (let i = 0; i < count; i++) {
    for (let level = 0; level < high; level++) {
      boxes.push(crateAt(startX + i * 28, floor - 28 * (level + 1)));
    }
  }
  return boxes;
}

/** The reported scenario: a run shoving two-high stacks off a ledge. */
export function ledgeScenario(count = 5, startX = 640, high = 2): Scenario {
  return {
    rows: ledgeMap(),
    spawn: { x: startX - 140, y: SHELF_ROW * 32 - 26 },
    boxes: stacks(count, startX, high),
  };
}

/** The same row of stacks with no ledge at all, as a control. */
export function flatScenario(count = 5, startX = 640, high = 2): Scenario {
  return {
    rows: ledgeMap(COLS),
    spawn: { x: startX - 140, y: SHELF_ROW * 32 - 26 },
    boxes: stacks(count, startX, high),
  };
}
