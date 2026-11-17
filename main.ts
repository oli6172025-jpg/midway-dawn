// MIDWAY: DAWN — the best-game-01 hand-in program (Node 22, standard library only, erasable TypeScript).
//
// What the bounty asks of it (best-game-01-kit/RULES.txt, "Your program, main.ts"): copy game/ and screenshots/
// from this repository to /output and write /output/dossier.json with buildDossier from the kit's
// vendor/makefun-game.ts, unchanged. Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Before handing in, it checks the screenshots against the gate's limits and replays one battle with the game's
// own engine (the classic scripts under game/src/engine/, loaded into a vm exactly as the browser runs them) to
// show the build is sound and deterministic. Both only print; the files written are the kit's three, and both runs
// of the grader write the same bytes, since nothing here reads the clock or chance.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The scorer's caps from its gate.json: only text_max_bytes shapes the dossier; the rest refuse what it refuses. */
const GATE_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Copy one directory of the repository into the output, replacing whatever an earlier local run left there. */
function handIn(name: string): void {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  if (!existsSync(from)) throw new Error(`main.ts: ${name}/ is missing from the repository`);
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

/** Width and height of a PNG or baseline/progressive JPEG, read from its header; null when neither. */
function imageSize(bytes: Buffer): { w: number; h: number } | null {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { w: bytes.readUInt16BE(i + 7), h: bytes.readUInt16BE(i + 5) };
    i += 2 + length;
  }
  return null;
}

/** The gate's screenshots row, said out loud: 3-4 images, <= 256 KiB, long side <= 1280, short side >= 480. */
function checkScreenshots(): string[] {
  const dir = join(repoRoot, 'screenshots');
  const names = readdirSync(dir).filter((n) => !n.startsWith('.')).sort();
  const problems: string[] = [];
  if (names.length < 3 || names.length > 4) problems.push(`screenshots/ holds ${names.length} images, not 3 or 4`);
  for (const name of names) {
    const bytes = readFileSync(join(dir, name));
    const size = imageSize(bytes);
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name)) problems.push(`${name}: name not allowed`);
    if (bytes.length > GATE_CAPS.screenshots.max_bytes) problems.push(`${name}: ${bytes.length} bytes, over 256 KiB`);
    if (!size) problems.push(`${name}: not a PNG or JPEG`);
    else if (Math.max(size.w, size.h) > 1280 || Math.min(size.w, size.h) < 480) problems.push(`${name}: ${size.w}x${size.h} outside 1280 long / 480 short`);
  }
  return problems;
}

/** Loads the game's engine scripts, in index.html's order, into a fresh vm context. */
function loadEngine(): any {
  const html = readFileSync(join(repoRoot, 'game', 'index.html'), 'utf8');
  const context = vm.createContext({});
  for (const m of html.matchAll(/<script\s+src="(src\/engine\/[^"]+\.js)"/g)) {
    vm.runInContext(readFileSync(join(repoRoot, 'game', m[1]), 'utf8'), context, { filename: m[1] });
  }
  return (context as { MD?: unknown }).MD;
}

/** One whole battle with the autopilot in command, twice: the same seed must give the same day. */
function replayBattle(): string {
  const a = loadEngine().Sim.autoplay({ seed: 1942, difficulty: 'historical', style: 'historical' });
  const b = loadEngine().Sim.autoplay({ seed: 1942, difficulty: 'historical', style: 'historical' });
  const same = JSON.stringify(a.log) === JSON.stringify(b.log);
  const MD = loadEngine();
  const score = MD.Sim.score(a);
  return `seed 1942: ${a.result} at ${MD.Geo.clock(a.t)} (${score.J}-${score.A}), ${a.log.length} events, deterministic: ${same}`;
}

mkdirSync(outputDir, { recursive: true });
for (const p of checkScreenshots()) console.warn(`main.ts: warning: ${p}`);
try {
  console.log(`MIDWAY: DAWN engine check — ${replayBattle()}`);
} catch (err) {
  console.warn(`main.ts: warning: engine replay failed: ${(err as Error).message}`);
}
handIn('game');
handIn('screenshots');
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, GATE_CAPS));
console.log(`MIDWAY: DAWN handed in to ${outputDir}: game/, screenshots/, dossier.json (${statSync(join(outputDir, 'dossier.json')).size} bytes)`);
