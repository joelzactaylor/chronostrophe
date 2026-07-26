/**
 * Headless checks for the timeline simulation: forward physics recording,
 * scrubbing, reverse-time worldline replay and the "ride the rewinding box"
 * mechanic the level is built around. Run with `npm run check:sim`.
 */
import { buildLevel } from '../src/game/level';
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

function makeWorld(): World {
  const level = buildLevel();
  return new World(level.map, level.spawn, level.boxes);
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

// 9. The level is completable with the intended solution.
{
  const level = buildLevel();
  const w = new World(level.map, level.spawn, level.boxes);
  const box = w.boxes[0];
  const exit = level.exit;
  let phase = 0;
  let prevX = w.player.x;
  let stuck = 0;
  let paradoxes = 0;
  let won = false;
  let jumpHold = 0;
  let touchedHazard = false;

  for (let tick = 0; tick < 4000 && !won; tick++) {
    const p = w.player;
    const grounded = p.groundedOn !== -2;
    const input: Input = { ...NO_INPUT };

    switch (phase) {
      case 0: // run to the end of shelf A, hopping the spike pit
        input.right = true;
        if (grounded && p.x > 250 && p.x < 266 && p.y > 400) input.jumpPressed = true;
        if (grounded && stuck > 2) input.jumpPressed = true;
        if (p.x >= 740 && grounded && p.y < 340) phase = 1;
        break;
      case 1: // clear the gap onto shelf B
        input.right = true;
        if (grounded && p.y > 300) input.jumpPressed = true;
        if (grounded && p.y < 270) phase = 2;
        break;
      case 2: // shove the crate off the shelf
        input.right = true;
        if (box.state.y > 300) phase = 3;
        break;
      case 3: // dive after the crate into the recess
        input.right = true;
        if (grounded && p.y > 470) phase = 3.5;
        break;
      case 3.5: // climb out and step onto the anachroverter
        input.left = true;
        if (grounded && stuck > 2) input.jumpPressed = true;
        if (grounded && p.y < 460 && p.x <= 1010) phase = 4;
        break;
      case 4: // the pad pauses the timeline; flip it and step off backwards
        w.dir = -1;
        w.splitRun();
        phase = 5;
        break;
      case 5: // step onto the resting crate
        input.right = true;
        if (p.groundedOn === 0) phase = 6;
        else if (grounded && stuck > 2) input.jumpPressed = true;
        break;
      case 6: // ride the rewinding worldline upward
        if (box.state.y < 275) {
          input.jumpPressed = true;
          input.jump = true;
          input.right = true;
          phase = 7;
        }
        break;
      case 7: // land on the exit shelf and walk into the black hole
        input.right = true;
        input.jump = p.vy < 0;
        break;
    }

    // Hold the jump key for a full-height jump, the way a player would.
    if (input.jumpPressed) jumpHold = 12;
    jumpHold = Math.max(0, jumpHold - 1);
    input.jump = input.jump || jumpHold > 0;

    if (phase !== 4) w.step(input);
    if (w.detectParadox()) paradoxes++;

    stuck = Math.abs(w.player.x - prevX) < 0.3 ? stuck + 1 : 0;
    prevX = w.player.x;

    const pr = playerRect(w.player);
    if (level.hazards.some((h) => pr.x < h.x + h.w && pr.x + pr.w > h.x && pr.y < h.y + h.h && pr.y + pr.h > h.y)) {
      touchedHazard = true;
    }
    won =
      pr.x < exit.x + exit.r &&
      pr.x + pr.w > exit.x - exit.r &&
      pr.y < exit.y + exit.r &&
      pr.y + pr.h > exit.y - exit.r;
    if (w.atTimeBound()) break;
  }

  check('the level can be completed with the intended solution', won, `phase=${phase} t=${w.now}`);
  check('the intended route never touches a hazard', !touchedHazard);
  console.log(`       (paradox ticks during the run: ${paradoxes})`);
}

if (failures.length > 0) throw new Error(`${failures.length} simulation check(s) failed: ${failures.join(', ')}`);
console.log('\nall simulation checks passed');
