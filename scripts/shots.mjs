// Takes the entry's screenshots: real renders of game/index.html in headless Chrome. Each shot opens the page
// with ?shot=<n>&seed=<s>, waits for the game to set window.__shotReady, and saves a JPEG under the bounty's limits
// (<= 256 KiB, 1280x720).
//
//   node scripts/shots.mjs            all shots in scripts/shots.json
//   node scripts/shots.mjs 2          only the shot whose name starts with "2" (or "02")
//   CHROME=<path> node scripts/shots.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(root, 'scripts', 'shots.json'), 'utf8'));
const only = process.argv[2];
const outDir = process.env.SHOTS_OUT ?? join(root, 'screenshots');
const WIDTH = 1280;
const HEIGHT = 720;
const MAX_BYTES = 250 * 1024;

async function capture(page, shot) {
  const url = pathToFileURL(join(root, 'game', 'index.html')).href + shot.query;
  await page.send('Page.navigate', { url });
  let ready = false;
  for (let i = 0; i < 600 && !ready; i++) {
    await sleep(100);
    const r = await page.send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
    ready = r.result.value === true;
  }
  if (!ready) throw new Error(`shots: ${shot.name} never became ready`);
  await sleep(shot.settle ?? 400);
  let quality = 88;
  let bytes;
  for (;;) {
    const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
    bytes = Buffer.from(r.data, 'base64');
    if (bytes.length <= MAX_BYTES || quality <= 40) break;
    quality -= 6;
  }
  writeFileSync(join(outDir, shot.name), bytes);
  console.log(`${shot.name}: ${bytes.length} bytes at quality ${quality}`);
}

const { page, close } = await launch(WIDTH, HEIGHT);
try {
  mkdirSync(outDir, { recursive: true });
  for (const shot of shots) {
    if (only && !shot.name.startsWith(only) && !shot.name.startsWith('0' + only)) continue;
    await capture(page, shot);
  }
  if (page.logs.length) console.log(page.logs.join('\n'));
} finally {
  close();
}
