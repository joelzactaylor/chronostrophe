/**
 * Runs a headless simulation entry under node.
 *
 *   npm run sim                     # the whole sweep
 *   npm run sim -- checks Ballast   # one level
 *   npm run sim -- ghost-push-repro 600 5 2
 *
 * `World` builds a `CrateWorld`, which imports Phaser for its Matter binding, so
 * the bundle aliases Phaser to a stub. Nothing outside the deterministic core in
 * src/core/physics.ts is exercised by these checks.
 */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const [entry = 'checks', ...args] = process.argv.slice(2);
const outfile = join(mkdtempSync(join(tmpdir(), 'chronostrophe-sim-')), 'sim.mjs');

await build({
  entryPoints: [join(here, `${entry}.ts`)],
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { phaser: join(here, 'phaser-stub.js') },
  outfile,
  logLevel: 'warning',
});

process.argv = [process.argv[0], outfile, ...args];
await import(pathToFileURL(outfile).href);
