// Batch balance test: plays N whole battles with the autopilot commanding Kido Butai and prints how they end.
//   node scripts/simulate.mjs [games=100] [style=historical|aggressive] [difficulty=historical] [--log seed]
// The design target (Historical, historical autopilot): Japan loses 2-4 carriers on average, America 1-2.
import { loadEngine } from './engine.mjs';

const args = process.argv.slice(2);
const logSeed = args.includes('--log') ? Number(args[args.indexOf('--log') + 1]) : null;
const plain = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--log');
const games = Number(plain[0] ?? 100);
const style = plain[1] ?? 'historical';
const difficulty = plain[2] ?? 'historical';
const MD = loadEngine();

if (logSeed !== null) {
  const s = MD.Sim.autoplay({ seed: logSeed, difficulty, style });
  for (const e of s.log) if (e.text) console.log(MD.Geo.clock(e.t), `[${e.kind}/${e.side}]`, e.text);
  console.log(JSON.stringify(MD.Sim.score(s)), s.result, s.endReason);
  process.exit(0);
}

const sum = { jLost: 0, aLost: 0, jPlanes: 0, aPlanes: 0, midway: 0, end: 0 };
const results = { victory: 0, defeat: 0, draw: 0 };
const hist = { j: [0, 0, 0, 0, 0], a: [0, 0, 0, 0] };
const started = Date.now();
for (let seed = 1; seed <= games; seed++) {
  const s = MD.Sim.autoplay({ seed, difficulty, style });
  const sc = MD.Sim.score(s);
  sum.jLost += sc.ourCarriers.lost;
  sum.aLost += sc.usCarriers.lost;
  sum.jPlanes += s.losses.J.planes;
  sum.aPlanes += s.losses.A.planes;
  sum.midway += s.midway.hp;
  sum.end += s.t;
  results[s.result] += 1;
  hist.j[sc.ourCarriers.lost] += 1;
  hist.a[sc.usCarriers.lost] += 1;
}
const avg = (v) => (v / games).toFixed(2);
console.log(`${games} games, autopilot ${style}, difficulty ${difficulty}, ${Date.now() - started} ms`);
console.log(`Japanese carriers lost: ${avg(sum.jLost)}  (0..4: ${hist.j.join(' / ')})`);
console.log(`US carriers lost:       ${avg(sum.aLost)}  (0..3: ${hist.a.join(' / ')})`);
console.log(`Planes lost J ${avg(sum.jPlanes)}, A ${avg(sum.aPlanes)}; Midway hp ${avg(sum.midway)}; ends at ${MD.Geo.clock(sum.end / games)}`);
console.log(`Results: ${results.victory} victories, ${results.defeat} defeats, ${results.draw} draws`);
