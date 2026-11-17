// Loads the game's own simulation (the classic scripts under game/src/engine/) into a Node vm context, so tests
// and batch simulations run exactly the code the browser runs. The script order is read from game/index.html,
// which is the one list of what the page loads.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The engine scripts index.html loads, in its order. */
export function engineScripts() {
  const html = readFileSync(join(root, 'game', 'index.html'), 'utf8');
  const out = [];
  for (const m of html.matchAll(/<script\s+src="(src\/engine\/[^"]+\.js)"/g)) out.push(m[1]);
  return out;
}

/** A fresh MD namespace holding the engine. */
export function loadEngine() {
  const context = vm.createContext({});
  for (const rel of engineScripts()) {
    vm.runInContext(readFileSync(join(root, 'game', rel), 'utf8'), context, { filename: rel });
  }
  return context.MD;
}
