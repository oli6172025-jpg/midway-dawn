// End-to-end play test in headless Chrome: real clicks, drags and keys on game/index.html, then a whole battle
// with the autopilot giving orders through the same Session.order the panels use, until the debrief, then
// "Fight again". Fails on any page exception or network request. Frames go to $PLAYTEST_OUT (default: a temp dir).
//   node scripts/playtest.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.PLAYTEST_OUT ?? join(tmpdir(), 'midway-dawn-playtest');
mkdirSync(out, { recursive: true });
const { page, close } = await launch(1280, 720);
const problems = [];
const check = (cond, what) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + what);
  if (!cond) problems.push(what);
};

async function js(expr) {
  const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('evaluate: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
}
async function centre(selector) {
  return js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
}
async function mouse(type, p, button = 'left', buttons = 1) {
  await page.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button, buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: 1 });
}
async function click(p) {
  await mouse('mouseMoved', p, 'none', 0);
  await mouse('mousePressed', p);
  await mouse('mouseReleased', p);
}
async function drag(a, b, button = 'left') {
  const buttons = button === 'right' ? 2 : 1;
  await mouse('mouseMoved', a, 'none', 0);
  await mouse('mousePressed', a, button, buttons);
  for (let i = 1; i <= 8; i++) await mouse('mouseMoved', { x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 }, button, buttons);
  await mouse('mouseReleased', b, button, buttons);
}
async function key(k, code) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k === ' ' ? ' ' : k });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
}
async function frame(name) {
  const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(join(out, name + '.jpg'), Buffer.from(r.data, 'base64'));
}

try {
  await page.send('Page.navigate', { url: pathToFileURL(join(root, 'game', 'index.html')).href });
  await sleep(800);
  check(await js(`MD.App.mode === 'title'`), 'title screen shows first');
  await click(await centre('[data-diff="admiral"]'));
  await click(await centre('#btn-start'));
  await sleep(300);
  check(await js(`MD.App.mode === 'play' && MD.App.session.difficulty === 'admiral'`), 'TAKE COMMAND starts an Admiral battle');
  check(await js(`!document.getElementById('tutorial').classList.contains('hidden')`), 'tutorial opens on the first battle');
  for (let i = 0; i < 4; i++) await click(await centre('#tutorial .next'));
  check(await js(`document.getElementById('tutorial').classList.contains('hidden')`), 'tutorial steps through to the end');

  // Drag Hiryu's card onto Midway: the first strike launches.
  const midway = await js(`MD.App.camera.toScreen({ x: 0, y: 0 })`);
  await drag(await centre('.card[data-carrier="hiryu"] .deck'), midway);
  await sleep(100);
  check(await js(`MD.App.session.state.carriers.hiryu.deck.state === 'launching'`), 'dragging Hiryu to Midway launches her strike');

  // A refused order says why: Akagi has nothing spotted.
  await click(await centre('.card[data-carrier="akagi"] [data-act="spot"]'));
  check(await js(`MD.App.session.state.carriers.akagi.deck.state === 'spotting'`), 'SPOT starts spotting Akagi');
  await click(await centre('.card[data-carrier="kaga"] [data-act="rearm"]'));
  check(await js(`!!MD.App.session.state.carriers.kaga.rearm`), 'REARM starts rearming Kaga');

  // Right-drag a search line toward the east.
  const kb = await js(`MD.App.camera.toScreen(MD.App.session.state.groups.KB)`);
  await drag(kb, { x: kb.x + 220, y: kb.y - 60 }, 'right');
  check(await js(`MD.App.session.state.flights.some(f => f.kind === 'scout' && f.side === 'J')`), 'right-drag sends a search plane');

  // Drag the fleet to set a course; wheel zoom; keys.
  await drag(kb, { x: kb.x + 120, y: kb.y + 80 });
  check(await js(`!!MD.App.session.state.groups.KB.waypoint`), 'dragging the fleet sets its course');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 360, deltaX: 0, deltaY: -240 });
  await key(' ', 'Space');
  check(await js(`MD.App.session.paused === false`), 'Space resumes the battle');
  await key('3', 'Digit3');
  check(await js(`MD.App.session.speed === 4`), 'key 3 sets 4x');
  await sleep(1500);
  check(await js(`MD.App.session.state.t > 5`), 'time advances');
  await frame('1-early');

  // The rest of the day: the autopilot orders through the session, auto-pauses are resumed, as a player would.
  await js(`(() => { const mem = MD.Autopilot.create('historical'); let last = -1;
    window.__bot = setInterval(() => { const s = MD.App.session; if (!s || MD.App.mode !== 'play') return;
      if (s.state.t !== last) { last = s.state.t; for (const o of MD.Autopilot.orders(s.state, mem)) MD.Sim.order(s.state, o); }
      if (s.paused) s.setPaused(false); }, 30); })()`);
  let shotAt = 0;
  for (let i = 0; i < 240; i++) {
    await sleep(500);
    const st = await js(`({ mode: MD.App.mode, t: MD.App.session.state.t })`);
    if (st.t > shotAt + 150) {
      shotAt = st.t;
      await frame('2-t' + st.t);
    }
    if (st.mode === 'debrief') break;
  }
  check(await js(`MD.App.mode === 'debrief'`), 'the battle ends in the debrief');
  await frame('3-debrief');
  const result = await js(`MD.App.session.state.result + ' ' + MD.App.session.state.endReason`);
  console.log('     result: ' + result);
  await js(`clearInterval(window.__bot)`);
  await click(await centre('#debrief [data-act="again"]'));
  await sleep(300);
  check(await js(`MD.App.mode === 'play' && MD.App.session.state.t === 0`), 'FIGHT AGAIN restarts the same battle');
  await click(await centre('#btn-help'));
  check(await js(`!document.getElementById('tutorial').classList.contains('hidden')`), '? replays the tutorial');
} catch (err) {
  problems.push(String(err));
  console.log('FAIL ' + err);
} finally {
  const bad = page.logs.filter((l) => l.startsWith('EXCEPTION') || l.startsWith('NETWORK') || l.startsWith('error'));
  for (const l of bad) problems.push(l);
  if (page.logs.length) console.log(page.logs.slice(0, 20).join('\n'));
  close();
}
console.log(problems.length ? `\n${problems.length} problem(s); frames in ${out}` : `\nall good; frames in ${out}`);
process.exit(problems.length ? 1 : 0);
