// MIDWAY: DAWN — the best-game-01 hand-in program (Node 22, standard library only, erasable TypeScript).
//
// What the bounty asks of it (best-game-01-kit/RULES.txt, "Your program, main.ts"): copy game/ and screenshots/
// from this repository to /output and write /output/dossier.json with buildDossier from the kit's
// vendor/makefun-game.ts, unchanged. Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Both runs of the grader must write the same bytes, so nothing here reads the clock or chance.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

mkdirSync(outputDir, { recursive: true });
handIn('game');
handIn('screenshots');
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, GATE_CAPS));
console.log(`MIDWAY: DAWN handed in to ${outputDir}: game/, screenshots/, dossier.json`);
