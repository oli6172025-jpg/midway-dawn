// Headless Chrome over the DevTools protocol with Node's own WebSocket: shared by the screenshot and play-test
// scripts. No npm package; Chrome is found at its usual install paths or through $CHROME.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const PORT = 9347;

export function findChrome() {
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitForDevtools() {
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
export async function openPage() {
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


/** Starts headless Chrome at a window size; returns { page, close }. */
export async function launch(width, height) {
  const profile = join(tmpdir(), 'midway-dawn-chrome-profile');
  rmSync(profile, { recursive: true, force: true });
  const chrome = spawn(findChrome(), [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--mute-audio',
    'about:blank',
  ], { stdio: 'ignore' });
  await waitForDevtools();
  const page = await openPage();
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return { page, close: () => { page.close(); chrome.kill(); } };
}
