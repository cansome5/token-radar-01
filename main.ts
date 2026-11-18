// token-radar-01 entry, v3 - "Calibrated Launch Radar".
//
// The model is the category-peer median: each pre-token protocol is valued from the snapshot's own
// market-cap/TVL record for its category, its seven-day change and its age, with a global-median
// fallback for categories too thin to calibrate (see lib/model.ts). The page reads out/data.js,
// written here from the same board, and the dossier is written last with the kit's vendored library.
//
// Node 22.18 or later, standard library only. Local run, from this directory:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardProblem, dataScript, parseSnapshot, scoreSnapshot } from './lib/model.ts';
import type { Radar, Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

// The scorer's caps: the text budget shapes the dossier bytes; the rest only refuse a bad tree.
const DOSSIER_TEXT_BYTES = 65_536;
const SHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASH_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const PLAIN_IMAGE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Value of `--flag value` first, then `--flag=value`, else the fallback. */
function option(flag: string, fallback: string): string {
  const position = process.argv.indexOf(`--${flag}`);
  if (position >= 0 && position + 1 < process.argv.length) return process.argv[position + 1]!;
  const withValue = process.argv.find((item) => item.startsWith(`--${flag}=`));
  if (withValue !== undefined) return withValue.slice(flag.length + 3);
  return fallback;
}

const sourceArg = option('input', '/input');
const snapshotPath = sourceArg.endsWith('.json') ? sourceArg : join(sourceArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(`token radar: no snapshot at ${snapshotPath}. Pass --input <snapshot.json|directory> or mount /input.\n`);
  process.exit(2);
}

const outputDir = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
let snapshot: Snapshot;
let radar: Radar;
try {
  snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
  radar = scoreSnapshot(snapshot);
} catch (error) {
  process.stderr.write(`token radar: could not score ${snapshotPath}: ${(error as Error).message}\n`);
  process.exit(2);
}
const problem = boardProblem(radar.board, snapshot);
if (problem !== null) {
  process.stderr.write(`token radar: the board would fail the gate: ${problem}\n`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: radar.board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

/** Copy the regular, non-dot files of one directory into another; return the names copied. */
function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const entry of readdirSync(from)) {
    if (entry.startsWith('.')) continue;
    const full = join(from, entry);
    if (!statSync(full).isFile()) continue;
    copyFileSync(full, join(to, entry));
    names.push(entry);
  }
  return names;
}

copyDirectory(join(here, 'dashboard'), join(outputDir, 'dashboard'));
const shots = copyDirectory(join(here, 'screenshots'), join(outputDir, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ has ${shots.length} image${shots.length === 1 ? '' : 's'}; the entry needs 3 (board, detail, filtered).\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!PLAIN_IMAGE.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: use letters, digits and . _ -, 1 to 128 characters.\n`);
    process.exit(1);
  }
}

writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, { text_max_bytes: DOSSIER_TEXT_BYTES, screenshots: SHOT_CAPS, dashboard: DASH_CAPS }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols read, ${snapshot.watchlist.length} on the watchlist, ` +
    `${radar.board.length} rows ranked (${radar.meta.early_size} early, ${radar.meta.live.length} live set aside)\n` +
    `token radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ` +
    `${join(outputDir, 'dashboard')} (${readdirSync(join(outputDir, 'dashboard')).length} files), ` +
    `${join(outputDir, 'screenshots')} (${shots.length} images) and ${join(outputDir, 'dossier.json')}\n`,
);
