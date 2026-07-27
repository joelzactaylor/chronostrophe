/**
 * Headless checks for the timeline simulation: forward physics recording,
 * scrubbing, reverse-time worldline replay and the "ride the rewinding box"
 * mechanic the level is built around. Run with `npm run check:sim`.
 */
import { LevelDef, MONOLITH_RELEASE, buildLevel, button, phaseBlocks } from '../src/game/level';
import { TileMap } from '../src/core/physics';
import { NO_INPUT, World, playerRect } from '../src/core/world';
import { Input } from '../src/core/world';
import { TILE } from '../src/core/types';

const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name} ${detail}`);
    failures.push(name);
  }
}

/** Index of "Lift", the level that teaches reverse time. */
const LIFT = 4;

/**
 * A rig for the physics/recording checks rather than a shipped level: a floor with
 * a shelf at row 9 holding a crate, and a recess in the floor beneath the shelf's
 * right edge so a crate pushed off it lands flush with the surrounding floor.
 */
function rigWorld(): World {
  const rows: string[] = [];
  for (let y = 0; y < 17; y++) {
    let row = '';
    for (let x = 0; x < 44; x++) {
      const floor = y >= 15 && !(y === 15 && x >= 32 && x <= 35);
      const shelf = y === 9 && x >= 26 && x <= 31;
      const wall = x === 43 && y < 15;
      row += floor || shelf || wall ? '#' : '.';
    }
    rows.push(row);
  }
  return new World(new TileMap(rows), { x: 2 * TILE, y: 15 * TILE - 28 }, [
    { x: 29 * TILE, y: 9 * TILE - 28, w: 28, h: 28 },
  ]);
}

function makeWorld(): World {
  return rigWorld();
}

function run(world: World, ticks: number, input: Input = NO_INPUT): void {
  for (let i = 0; i < ticks; i++) world.step(input);
}

// 1. Gravity, ground contact and recording.
{
  const w = makeWorld();
  run(w, 30);
  check('player rests on the floor', Math.abs(w.player.y - (15 * TILE - 28)) < 1, `y=${w.player.y}`);
  check('timeline advanced', w.now === 30, `now=${w.now}`);
  check('history is recorded', !!w.current.states[30]);
}

// 2. Pushing a live box, and the box falling off the shelf into the chute.
{
  const w = makeWorld();
  const box = w.boxes[0];
  const startX = box.state.x;
  const startY = box.state.y;
  w.player.x = box.state.x - 21;
  w.player.y = 9 * TILE - 28;
  run(w, 240, { ...NO_INPUT, right: true });
  check('box was pushed right', box.state.x > startX + 40, `x=${box.state.x} from ${startX}`);
  check('box fell into the chute', box.state.y > startY + 100, `y=${box.state.y} from ${startY}`);
  check('box settled in the recess below the chute', Math.abs(box.state.y - (16 * TILE - 28)) < 2, `y=${box.state.y}`);
  check('box worldline recorded', box.recordedMax === w.now, `max=${box.recordedMax} now=${w.now}`);

  // 3. Scrubbing puts the object back on its recorded worldline.
  const midTick = 120;
  const recorded = w.boxStateAt(box, midTick);
  w.scrubTo(midTick);
  check('scrub restores recorded object state', box.state.y === recorded.y && box.state.x === recorded.x);
  w.scrubTo(240);

  // 4. Reverse time: the box retraces its fall and carries the player upward.
  const restingY = box.state.y;
  w.dir = -1;
  w.player.x = box.state.x + 4;
  w.player.y = box.state.y - 28;
  w.player.vx = 0;
  w.player.vy = 0;
  const startPlayerY = w.player.y;
  run(w, 200);
  check('rewinding box rises along its recorded path', box.state.y < restingY - 100, `y=${box.state.y}`);
  check('player was carried upward by the rewinding box', w.player.y < startPlayerY - 100, `y=${w.player.y}`);
  const pr = playerRect(w.player);
  check(
    'player is still standing on the box',
    Math.abs(pr.y + pr.h - box.state.y) < 2,
    `feet=${pr.y + pr.h} boxTop=${box.state.y}`,
  );
  check('rewound time moved backwards', w.now < 240, `now=${w.now}`);
}

// 5. Ghost runs and paradox detection.
{
  const w = makeWorld();
  run(w, 120, { ...NO_INPUT, right: true });
  const ghostPos = { x: w.player.x, y: w.player.y };
  w.splitRun();
  w.scrubTo(60);
  check('a ghost run exists', w.runs.length === 1);
  check('ghost is present at the scrubbed time', w.ghostsAt(60).length === 1);

  w.player.x = w.ghostsAt(60)[0].state.x;
  w.player.y = w.ghostsAt(60)[0].state.y;
  let paradox = null;
  for (let i = 0; i < 120 && !paradox; i++) paradox = w.detectParadox();
  check('ghosts are pass-through: standing inside one is not a paradox', paradox === null);

  w.player.x = ghostPos.x + 400;
  check('standing clear of history is safe', w.detectParadox() === null);

  w.erasePlayerHistory();
  check('chronoclast erases recorded history', w.runs.length === 0 && w.ghostsAt(60).length === 0);
}

// 6. Ghost bodies are solid for objects: they shove crates and carry them.
{
  const w = makeWorld();
  const box = w.boxes[0];
  w.player.x = box.state.x - 21;
  w.player.y = 9 * TILE - 28;
  run(w, 90, { ...NO_INPUT, right: true });
  const pushedTo = box.state.x;
  check('the recording run pushed the crate', pushedTo > box.initial.x + 10, `x=${pushedTo}`);

  w.splitRun();
  w.scrubTo(0);
  check('the run is now history', w.runs.length === 1);
  w.player.x = 100;
  w.player.y = 15 * TILE - 28;
  run(w, 90, { ...NO_INPUT });
  check(
    'the ghost re-pushes the crate along the same path',
    Math.abs(box.state.x - pushedTo) < 6,
    `x=${box.state.x} expected~${pushedTo}`,
  );
}

// 7. A frozen timeline does not rewrite the recorded state at the tick a device holds.
{
  const w = makeWorld();
  run(w, 60, { ...NO_INPUT, right: true });
  const held = { ...w.current.states[60]! };
  for (let i = 0; i < 90; i++) w.stepPlayerFrozen({ ...NO_INPUT, right: true });
  check('the live body moves while the timeline is frozen', w.player.x > held.x + 20, `x=${w.player.x}`);
  check(
    'freezing does not overwrite the recorded state at that tick',
    w.current.states[60]!.x === held.x && w.current.states[60]!.y === held.y,
    `recorded x=${w.current.states[60]!.x} expected ${held.x}`,
  );
  w.splitRun();
  check('the ghost stays on its recorded path at the device tick', w.ghostsAt(60)[0].state.x === held.x);
}

// 8. A recorded body left standing on nothing is an immediate paradox.
{
  const w = makeWorld();
  const box = w.boxes[0];
  w.player.x = box.state.x;
  w.player.y = box.state.y - 28;
  run(w, 20);
  check('the run stood on the crate', w.player.groundedOn === box.id, `groundedOn=${w.player.groundedOn}`);
  w.splitRun();
  check('no paradox while the crate is still there', w.detectParadox() === null);

  box.state.x += 300;
  const paradox = w.detectParadox();
  check('a ghost standing on nothing is a paradox', paradox?.reason === 'a former self is standing on nothing', `${paradox?.reason}`);
  if (paradox) w.removeRun(paradox.run);
  check('the contradicted run is removed from history', w.runs.length === 0 && w.detectParadox() === null);
}

// 9. Overlapping ghosts do not collide with each other, and do not double-shove a crate.
{
  const single = makeWorld();
  const box = single.boxes[0];
  single.player.x = box.state.x - 21;
  single.player.y = 9 * TILE - 28;
  run(single, 90, { ...NO_INPUT, right: true });
  single.splitRun();
  const twin = { ...single.runs[0], id: 99 };
  single.scrubTo(0);
  single.player.x = 100;
  single.player.y = 15 * TILE - 28;
  run(single, 90);
  const oneGhost = box.state.x;

  const pair = makeWorld();
  const pairBox = pair.boxes[0];
  pair.player.x = pairBox.state.x - 21;
  pair.player.y = 9 * TILE - 28;
  run(pair, 90, { ...NO_INPUT, right: true });
  pair.splitRun();
  pair.runs.push({ ...pair.runs[0], id: twin.id });
  pair.scrubTo(0);
  pair.player.x = 100;
  pair.player.y = 15 * TILE - 28;
  let paradox = null;
  for (let i = 0; i < 90; i++) {
    pair.step(NO_INPUT);
    paradox = paradox ?? pair.detectParadox();
  }
  check('two ghosts in the same space do not contradict each other', paradox === null, `${paradox?.reason}`);
  check(
    'overlapping ghosts move a crate once, not twice',
    Math.abs(pairBox.state.x - oneGhost) < 2,
    `pair=${pairBox.state.x} single=${oneGhost}`,
  );
}

/** A level exactly as the game builds it, pads solid to objects included. */
function levelWorld(level: LevelDef): World {
  return new World(
    level.map,
    level.spawn,
    level.boxes,
    level.devices.map((d) => d.rect),
    level.buttons ?? [],
    level.phase ?? [],
  );
}

// 10. Level 1, "Threshold": the monolith blocks the run, and scrubbing back gets you through.
{
  const level = buildLevel(0);
  const w = levelWorld(level);
  const stone = w.boxes[0];
  const held = { ...stone.initial };

  run(w, MONOLITH_RELEASE - 10, { ...NO_INPUT, right: true });
  check('the monolith hangs until its tick', stone.state.y === held.y, `y=${stone.state.y}`);
  check('the player is still short of the monolith', w.player.x < stone.state.x, `x=${w.player.x}`);

  run(w, 240, { ...NO_INPUT, right: true, jump: true, jumpPressed: true });
  check('the monolith has fallen to the floor', stone.state.y > held.y + 200, `y=${stone.state.y}`);
  check(
    'the monolith walls off the run, even with jumping',
    w.player.x + 20 <= stone.state.x + 1,
    `x=${w.player.x} stone=${stone.state.x}`,
  );
  check('the exit is unreachable this way', w.player.x < level.exit.x - 100, `x=${w.player.x}`);

  // Back to the chronoporter, then scrub the world to before the stone was let go.
  const pad = level.devices[0].rect;
  run(w, 60, { ...NO_INPUT, left: true });
  check('the pad is reachable from the monolith face', w.player.x < pad.x + pad.w, `x=${w.player.x}`);
  w.splitRun();
  w.scrubTo(40);
  check('scrubbing back re-suspends the monolith', w.boxes[0].state.y === held.y, `y=${stone.state.y}`);

  let won = false;
  for (let i = 0; i < 200 && !won; i++) {
    w.step({ ...NO_INPUT, right: true });
    won = Math.abs(w.player.x + 10 - level.exit.x) < level.exit.r && w.player.x > stone.state.x;
  }
  check('the past lets the player pass beneath the stone and reach the gate', won, `x=${w.player.x} t=${w.now}`);
  check('and the stone falls behind them', stone.state.y > held.y + 200, `y=${stone.state.y}`);
}

// 11. Standing where the monolith lands is fatal: the fix-up exceeds the player's own width.
{
  const level = buildLevel(0);
  const w = levelWorld(level);
  const stone = w.boxes[0];
  w.player.x = stone.state.x + 40;
  run(w, MONOLITH_RELEASE - 5);
  check('no crush while the stone still hangs', !w.crushed);
  let crushed = false;
  for (let i = 0; i < 60 && !crushed; i++) {
    w.step(NO_INPUT);
    crushed = w.crushed;
  }
  check('the falling monolith crushes the player', crushed, `t=${w.now}`);
}

// 12. The chronoporter levels: each pad in turn, scrub to the start, walk on.
{
  /**
   * Plays a chronoporter level the intended way: walk right, and on reaching each
   * pad in turn put the world back to `RESET_TICK` before carrying on. Reports the
   * tick each pad was reached at so the sprint windows can be checked.
   */
  const RESET_TICK = 5;
  function playPorterLevel(index: number): {
    won: boolean;
    crushed: boolean;
    padTicks: number[];
    now: number;
    x: number;
  } {
    const level = buildLevel(index);
    const w = levelWorld(level);
    const pads = level.devices.map((d) => d.rect.x);
    const padTicks: number[] = [];
    let next = 0;
    let won = false;
    let crushed = false;

    for (let i = 0; i < 1200 && !won && !crushed; i++) {
      w.step({ ...NO_INPUT, right: true });
      crushed = w.crushed;
      if (next < pads.length && w.player.x >= pads[next]) {
        padTicks.push(w.now);
        next++;
        w.splitRun();
        w.scrubTo(RESET_TICK);
      }
      const pr = playerRect(w.player);
      won =
        pr.x < level.exit.x + level.exit.r &&
        pr.x + pr.w > level.exit.x - level.exit.r &&
        pr.y < level.exit.y + level.exit.r &&
        pr.y + pr.h > level.exit.y - level.exit.r;
      if (w.atTimeBound()) break;
    }
    return { won, crushed, padTicks, now: w.now, x: w.player.x };
  }

  /** Walking straight at the level, with no use of the pad, gets stopped. */
  function sprintOnly(index: number): { won: boolean; x: number } {
    const level = buildLevel(index);
    const w = levelWorld(level);
    let won = false;
    for (let i = 0; i < 900 && !won; i++) {
      w.step({ ...NO_INPUT, right: true, jump: true, jumpPressed: i % 20 === 0 });
      const pr = playerRect(w.player);
      won =
        pr.x < level.exit.x + level.exit.r &&
        pr.x + pr.w > level.exit.x - level.exit.r &&
        pr.y < level.exit.y + level.exit.r &&
        pr.y + pr.h > level.exit.y - level.exit.r;
      if (w.atTimeBound()) break;
    }
    return { won, x: w.player.x };
  }

  /**
   * The crate levels: walk right and scrub on every pad as above, but once the last
   * pad has been used, shove the crate to `crateTo` and climb it onto the gate shelf.
   */
  function playCrateLevel(index: number): { won: boolean; crushed: boolean; padTicks: number[]; now: number; x: number; y: number } {
    const level = buildLevel(index);
    const w = levelWorld(level);
    const pads = level.devices.map((d) => d.rect.x);
    const padTicks: number[] = [];
    let next = 0;
    let won = false;
    let crushed = false;
    let jumpHold = 0;
    let prevX = w.player.x;
    let stuck = 0;

    for (let i = 0; i < 1500 && !won && !crushed; i++) {
      const grounded = w.player.groundedOn !== -2;
      const input: Input = { ...NO_INPUT, right: true };
      // The crate jams against the shelf's face: climb it, then climb onto the shelf.
      if (next >= pads.length && grounded && stuck > 1) input.jumpPressed = true;
      if (input.jumpPressed) jumpHold = 12;
      jumpHold = Math.max(0, jumpHold - 1);
      input.jump = jumpHold > 0;

      w.step(input);
      crushed = w.crushed;
      if (next < pads.length && w.player.x >= pads[next]) {
        padTicks.push(w.now);
        next++;
        w.splitRun();
        w.scrubTo(RESET_TICK);
      }
      stuck = Math.abs(w.player.x - prevX) < 0.3 ? stuck + 1 : 0;
      prevX = w.player.x;

      const pr = playerRect(w.player);
      won =
        pr.x < level.exit.x + level.exit.r &&
        pr.x + pr.w > level.exit.x - level.exit.r &&
        pr.y < level.exit.y + level.exit.r &&
        pr.y + pr.h > level.exit.y - level.exit.r;
      if (w.atTimeBound()) break;
    }
    return { won, crushed, padTicks, now: w.now, x: w.player.x, y: w.player.y };
  }

  // Per level: its index, the tick of the stone the first pad has to be reached ahead
  // of where the level opens with a sprint, and whether a crate has to be shoved into
  // place to finish.
  for (const [index, dash, crate] of [
    [1, 150, false],
    [2, null, true],
    [3, 150, true],
  ] as [number, number | null, boolean][]) {
    const level = buildLevel(index);
    const r = crate ? playCrateLevel(index) : playPorterLevel(index);
    check(`"${level.name}" is completable with the chronoporter alone`, r.won, `t=${r.now} x=${r.x} pads=${r.padTicks}`);
    check(`"${level.name}" does not crush the player on the intended route`, !r.crushed);
    check(`"${level.name}" uses every pad in the level`, r.padTicks.length === level.devices.length, `${r.padTicks}`);
    check(`"${level.name}" cannot be beaten by running straight at it`, !sprintOnly(index).won, `x=${sprintOnly(index).x}`);
    if (dash !== null) {
      check(
        `"${level.name}" first pad is reached before its stone comes down`,
        r.padTicks[0] < dash,
        `pad at t=${r.padTicks[0]}, stone at ${dash}`,
      );
    }
  }
}

// 13. Level "Lift": the stone falls, the crate is the step onto it, and reversing
// time carries the rider back up its own fall to the gate.
{
  const level = buildLevel(LIFT);
  const w = levelWorld(level);
  const crate = w.boxes[0];
  const stone = w.boxes[1];
  const hangingY = stone.initial.y;
  const exit = level.exit;
  const padX = level.devices[0].rect.x;

  let phase = 0;
  let prevX = w.player.x;
  let stuck = 0;
  let jumpHold = 0;
  let won = false;
  let rodeStone = false;
  let crushed = false;

  for (let tick = 0; tick < 4000 && !won && !crushed; tick++) {
    const p = w.player;
    const grounded = p.groundedOn !== -2;
    const input: Input = { ...NO_INPUT };

    switch (phase) {
      case 0: // walk to the anachroverter; the stone comes down on the way
        input.right = true;
        if (p.x >= padX && stone.state.y > hangingY + 200) phase = 1;
        break;
      case 1: // the pad pauses the timeline: flip time and step off backwards
        w.dir = -1;
        w.splitRun();
        phase = 2;
        break;
      case 2: // climb the crate, then step onto the resting stone
        input.right = true;
        if (grounded && stuck > 1) input.jumpPressed = true;
        if (p.groundedOn === stone.id) phase = 3;
        break;
      case 3: // ride the rewinding stone up to its hanging place
        rodeStone = rodeStone || stone.state.y < hangingY + 120;
        if (stone.state.y < hangingY + 8) phase = 4;
        break;
      case 4: // step off onto the shelf and walk into the gate
        input.right = true;
        break;
    }

    if (input.jumpPressed) jumpHold = 12;
    jumpHold = Math.max(0, jumpHold - 1);
    input.jump = input.jump || jumpHold > 0;

    if (phase !== 1) w.step(input);
    crushed = w.crushed;

    stuck = Math.abs(w.player.x - prevX) < 0.3 ? stuck + 1 : 0;
    prevX = w.player.x;

    const pr = playerRect(w.player);
    won =
      pr.x < exit.x + exit.r &&
      pr.x + pr.w > exit.x - exit.r &&
      pr.y < exit.y + exit.r &&
      pr.y + pr.h > exit.y - exit.r;
    if (w.atTimeBound()) break;
  }

  check('"Lift" can be completed with the intended solution', won, `phase=${phase} t=${w.now} y=${w.player.y}`);
  check('"Lift" carries the player up on the rewinding stone', rodeStone, `stone y=${stone.state.y}`);
  check('"Lift" does not crush the player on the intended route', !crushed);
  check('the crate stays clear of where the stone lands', crate.initial.x + crate.w <= stone.initial.x);
}

// 16. A time device is solid to objects: a crate shoved at a pad stops against it
// rather than settling in the volume the player has to stand in.
{
  const level = buildLevel(2);
  const w = levelWorld(level);
  const pad = level.devices[0].rect;
  const crate = w.boxes[0];
  crate.state.x = pad.x - 90;
  crate.state.y = 15 * TILE - crate.h;
  w.player.x = crate.state.x - 24;
  w.player.y = 15 * TILE - 28;
  for (let i = 0; i < 240; i++) w.step({ ...NO_INPUT, right: true });

  check(
    'a crate cannot be shoved into a time device',
    crate.state.x + crate.w <= pad.x + 1,
    `crate x=${crate.state.x} pad x=${pad.x}`,
  );
  check(
    'a crate shoved at a device does not climb on top of it',
    crate.state.y >= 15 * TILE - crate.h - 0.5,
    `crate y=${crate.state.y}`,
  );
}

// 17. The same from the other side: a crate shoved leftwards stops at the pad's
// right face instead of being lifted onto it.
{
  const level = buildLevel(2);
  const w = levelWorld(level);
  const pad = level.devices[0].rect;
  const crate = w.boxes[0];
  crate.state.x = pad.x + pad.w + 90;
  crate.state.y = 15 * TILE - crate.h;
  w.player.x = crate.state.x + crate.w + 4;
  w.player.y = 15 * TILE - 28;
  for (let i = 0; i < 240; i++) w.step({ ...NO_INPUT, left: true });

  check(
    'a crate shoved leftwards stops at the device face',
    crate.state.x >= pad.x + pad.w - 1 && crate.state.y >= 15 * TILE - crate.h - 0.5,
    `crate x=${crate.state.x} y=${crate.state.y} pad right=${pad.x + pad.w}`,
  );
}

// 18. A crate pushed into a standing body is resolved the short way out: sideways.
// The body used to be popped on top of it, because the only overlap resolution was
// the one gravity's own move performed.
{
  const level = buildLevel(2);
  const w = levelWorld(level);
  const pad = level.devices[0].rect;
  const crate = w.boxes[0];
  const floorTop = 15 * TILE;

  w.player.x = pad.x + 300; // clear of the pad: this is a body-versus-crate case
  w.player.y = floorTop - 28;
  // 6px into the body's left side, as a ghost's shove would leave it.
  crate.state.x = w.player.x - crate.w + 6;
  crate.state.y = floorTop - crate.h;

  const before = { x: w.player.x, y: w.player.y };
  w.step({ ...NO_INPUT });

  check(
    'a crate pushed into the body moves the body sideways, not upwards',
    w.player.y >= floorTop - 28 - 0.5 && w.player.x > before.x,
    `player x=${w.player.x} (was ${before.x}) y=${w.player.y}`,
  );
  check('being nudged aside by a crate is not a crush', !w.crushed);
  check(
    'the body ends up clear of the crate',
    w.player.x >= crate.state.x + crate.w - 0.5,
    `player x=${w.player.x} crate right=${crate.state.x + crate.w}`,
  );
}

// 19. A monolith rests on a crate that is under it: a crate is the one thing that
// takes its weight.
{
  const level = buildLevel(2);
  const w = levelWorld(level);
  const crate = w.boxes[0];
  const stone = w.boxes[1];
  const floorTop = 15 * TILE;
  crate.state.x = stone.state.x + 40;
  crate.state.y = floorTop - crate.h;
  crate.initial = { ...crate.state };

  w.player.x = 64;
  run(w, stone.releaseTick + 90, NO_INPUT);
  check(
    'a monolith comes to rest on a crate underneath it',
    Math.abs(stone.state.y + stone.h - crate.state.y) < 1.5,
    `stone bottom=${stone.state.y + stone.h} crate top=${crate.state.y}`,
  );
  check('and the crate is not shifted sideways by it', Math.abs(crate.state.x - (stone.state.x + 40)) < 1, `crate x=${crate.state.x}`);
}

// 20. Nothing else stops a monolith: a former self standing under it is not a floor,
// and its own history could not have survived, which is a paradox.
{
  const level = buildLevel(2);
  const w = levelWorld(level);
  const stone = w.boxes[1];
  const floorTop = 15 * TILE;

  // A long run standing well clear of the stone, so the ghost is present throughout.
  const stoodAt = { x: 200, y: floorTop - 28 };
  w.player.x = stoodAt.x;
  w.player.y = stoodAt.y;
  run(w, stone.releaseTick + 200, NO_INPUT);
  w.splitRun();
  // Now hang the stone over that spot and replay from before it was let go.
  stone.initial = { ...stone.initial, x: stoodAt.x - 50 };
  w.scrubTo(10);
  check('a ghost stands where the stone will fall', w.ghostsAt(w.now).length === 1);

  w.player.x = 64; // the live body is elsewhere
  w.player.y = floorTop - 28;
  let paradox = null;
  for (let i = 0; i < stone.releaseTick + 150 && !paradox; i++) {
    w.step(NO_INPUT);
    paradox = w.detectParadox();
  }
  check(
    'a monolith falling through a former self is a paradox',
    paradox?.reason === 'a former self was crushed by a monolith',
    `${paradox?.reason}`,
  );
  check(
    'and the ghost did not hold the stone up',
    stone.state.y + stone.h >= stoodAt.y + 4,
    `stone bottom=${stone.state.y + stone.h} ghost top=${stoodAt.y}`,
  );
}

// 21. A ghost cannot shove a monolith the way it shoves a crate.
{
  const level = buildLevel(2);
  const w = levelWorld(level);
  const stone = w.boxes[1];
  const floorTop = 15 * TILE;

  w.player.x = stone.state.x - 30;
  w.player.y = floorTop - 28;
  run(w, 60, { ...NO_INPUT, right: true });
  w.splitRun();
  w.scrubTo(5);
  w.player.x = 64;
  w.player.y = floorTop - 28;
  const restX = stone.state.x;
  run(w, stone.releaseTick + 120, NO_INPUT);
  check(
    'a monolith is never moved sideways, ghost or otherwise',
    Math.abs(stone.state.x - restX) < 0.5,
    `stone x=${stone.state.x} was ${restX}`,
  );
}

// 22. Push buttons: anything at all in one presses it, and the phase blocks follow.
{
  const rows: string[] = [];
  for (let y = 0; y < 17; y++) {
    let row = '';
    for (let x = 0; x < 44; x++) row += y >= 15 || x === 0 || x === 43 ? '#' : '.';
    rows.push(row);
  }
  const map = new TileMap(rows);
  const gate = phaseBlocks(0, 20, 13, 20, 14);
  const w = new World(
    map,
    { x: 2 * TILE, y: 15 * TILE - 28 },
    [{ x: 8 * TILE, y: 15 * TILE - 28, w: 28, h: 28 }],
    [],
    [button(6, 15, 0)],
    gate,
  );

  run(w, 20);
  check('a button with nothing in it is up', !w.isPressed(0));
  check('its blocks are solid while it is up', w.phaseSolids().length === gate.length);

  // Walk into the button: standing in it holds it down.
  let pressedWhilePassing = false;
  let openWhilePressed = true;
  for (let i = 0; i < 90; i++) {
    w.step({ ...NO_INPUT, right: true });
    if (w.isPressed(0)) {
      pressedWhilePassing = true;
      openWhilePressed &&= w.phaseSolids().length === 0;
    }
  }
  check('the live body presses the button', pressedWhilePassing, `x=${w.player.x}`);
  check('the blocks go passable while it is held', openWhilePressed);

  // ...and it is up again the moment the body leaves it: a button, not a switch.
  run(w, 120, { ...NO_INPUT, right: true });
  check('the button releases when nothing is in it', !w.isPressed(0), `x=${w.player.x}`);
  check('the blocks are solid again', w.phaseSolids().length === gate.length);
  check(
    'the solid blocks stop the body',
    w.player.x + 20 <= 20 * TILE + 1,
    `x=${w.player.x}`,
  );

  // A crate shoved into the button holds it down with nobody there.
  const crate = w.boxes[0];
  crate.state.x = 6 * TILE + 2;
  crate.state.y = 15 * TILE - 28;
  w.updateButtons();
  check('a crate left in a button presses it', w.isPressed(0), `crate x=${crate.state.x}`);
}

// 23. An inverted block is the complement: closed while the button is held.
{
  const rows: string[] = [];
  for (let y = 0; y < 17; y++) rows.push(''.padEnd(44, y >= 15 ? '#' : '.'));
  const w = new World(
    new TileMap(rows),
    { x: 2 * TILE, y: 15 * TILE - 28 },
    [],
    [],
    [button(10, 15, 1)],
    phaseBlocks(1, 20, 14, 20, 14, true),
  );
  run(w, 20);
  check('an inverted block is open while its button is up', w.phaseSolids().length === 0);
  w.player.x = 10 * TILE;
  w.updateButtons();
  check('an inverted block closes while its button is held', w.phaseSolids().length === 1);
}

// 24. Level 6, "Deadweight": the wall stands until something is left in the button.
{
  const level = buildLevel(5);
  const wallX = 26 * TILE;

  const w = levelWorld(level);
  run(w, 400, { ...NO_INPUT, right: true, jump: true, jumpPressed: true });
  check(
    '"Deadweight" cannot simply be walked through',
    w.player.x + 20 <= wallX + 1,
    `x=${w.player.x}`,
  );

  // The intended route: hop over the crate, shove it back into the button, leave it.
  const w2 = levelWorld(level);
  for (let i = 0; i < 160; i++) {
    w2.step({ ...NO_INPUT, right: true, jump: true, jumpPressed: i % 20 === 0 });
  }
  run(w2, 135, { ...NO_INPUT, left: true });
  check('the crate ends up in the button', w2.isPressed(0), `crate x=${w2.boxes[0].state.x}`);
  check('the wall is open while the crate holds it down', w2.phaseSolids().length === 0);

  for (let i = 0; i < 500; i++) {
    w2.step({ ...NO_INPUT, right: true, jump: true, jumpPressed: i % 25 === 0 });
  }
  check(
    '"Deadweight" is completable by leaving the crate on the button',
    w2.player.x > level.exit.x - 30,
    `x=${w2.player.x} exit=${level.exit.x}`,
  );
}

if (failures.length > 0) throw new Error(`${failures.length} simulation check(s) failed: ${failures.join(', ')}`);
console.log('\nall simulation checks passed');
