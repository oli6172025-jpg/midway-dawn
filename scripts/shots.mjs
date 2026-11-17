// Takes the entry's screenshots: real renders of game/index.html in headless Chrome, driven over the DevTools
// protocol with Node's own WebSocket (no npm package). Each shot opens the page with ?shot=<n>&seed=<s>, waits for
// the game to set window.__shotReady, and saves a JPEG under the bounty's limits (<= 256 KiB, 1280x720).
//
//   node scripts/shots.mjs            all shots in scripts/shots.json
//   node scripts/shots.mjs 2          only the shot whose name starts with "2" (or "02")
//   CHROME=<path> node scripts/shots.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(root, 'scripts', 'shots.json'), 'utf8'));
const only = process.argv[2];
const outDir = process.env.SHOTS_OUT ?? join(root, 'screenshots');
const WIDTH = 1280;
const HEIGHT = 720;
const MAX_BYTES = 250 * 1024;
const PORT = 9347;

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('shots: no Chrome found; set CHROME to its path');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('shots: Chrome did not open its DevTools port');
}

/** A minimal DevTools-protocol session over one page target. */
async function openPage() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let nextId = 1;
  const waiting = new Map();
  const logs = [];
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && waiting.has(data.id)) {
      const { resolve, reject } = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    } else if (data.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION ' + JSON.stringify(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text));
    } else if (data.method === 'Runtime.consoleAPICalled') {
      logs.push(data.params.type + ' ' + data.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (data.method === 'Network.requestWillBeSent') {
      const url = data.params.request.url;
      if (!url.startsWith('file:') && !url.startsWith('data:')) logs.push('NETWORK ' + url);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, logs, close: () => ws.close() };
}

async function capture(page, shot) {
  const url = pathToFileURL(join(root, 'game', 'index.html')).href + shot.query;
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
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

const profile = join(tmpdir(), 'midway-dawn-shots-profile');
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(findChrome(), [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  '--hide-scrollbars',
  '--mute-audio',
  '--allow-file-access-from-files',
  'about:blank',
], { stdio: 'ignore' });

try {
  await waitForDevtools();
  mkdirSync(outDir, { recursive: true });
  const page = await openPage();
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  for (const shot of shots) {
    if (only && !shot.name.startsWith(only) && !shot.name.startsWith('0' + only)) continue;
    await capture(page, shot);
  }
  if (page.logs.length) console.log(page.logs.join('\n'));
  page.close();
} finally {
  chrome.kill();
}
