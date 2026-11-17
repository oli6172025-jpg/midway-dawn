// The American commanders: rule-based, predictable in outline but not in detail.
//   1. At dawn PBYs from Midway search the north-west.
//   2. On a report of the Japanese carriers TF16 closes and launches everything; TF17 follows about an hour later.
//   3. Hornet's air group may take the wrong heading (35% on Historical).
//   4. Midway's bombers go in piecemeal between 05:30 and 08:00: little damage, but they upset the deck cycle.
//   5. Carriers keep a CAP up and turn away after being attacked; a later sighting brings a second strike.
// Difficulty changes how fast they react and how well they search.
(function (MD) {
  'use strict';

  const LAUNCH_RANGE = 170;

  function pad3(n) {
    n = Math.round(MD.Geo.norm360(n));
    return (n < 10 ? '00' : n < 100 ? '0' : '') + n;
  }

  const UsAI = {
    init: function (state) {
      state.usai = {
        knownAt: -1,
        firstCarrierAt: -1,
        tf: {
          TF16: { phase: 'patrol', goAt: -1, launchedAt: -999, strikes: 0, aim: null },
          TF17: { phase: 'patrol', goAt: -1, launchedAt: -999, strikes: 0, aim: null },
        },
        midwayWaves: null,
        b17Again: false,
        lastScoutAt: -999,
      };
      UsAI.launchDawnSearch(state);
    },

    /** Twelve Catalinas already 50 nm out at 04:30 on lines from 260° to 010°. */
    launchDawnSearch: function (state) {
      for (let i = 0; i < 12; i++) {
        const bearing = 260 + i * 10;
        MD.Scouting.launch(state, 'A', 'PBY ' + (i + 1), 'PBY', { x: 0, y: 0 }, bearing, 430, 'midway', 0, 50);
      }
    },

    /** The freshest report the Americans hold of the Japanese carriers, or null. */
    latest: function (state) {
      const intel = state.intel.A;
      let best = null;
      for (let i = 0; i < intel.length; i++) {
        const r = intel[i];
        if (r.kind === 'wrecks') continue;
        if (!best || r.obsT > best.obsT || (r.obsT === best.obsT && r.kind === 'carriers')) best = r;
      }
      return best;
    },

    /** Where a report's ships should be at minute `t`, dead-reckoned on its course and speed. */
    project: function (r, t) {
      return MD.Geo.advance(r, r.course, r.speed, Math.max(0, t - r.obsT));
    },

    tick: function (state) {
      const ai = state.usai;
      const r = UsAI.latest(state);
      if (r && ai.knownAt < 0) ai.knownAt = state.t;
      if (r && r.kind === 'carriers' && ai.firstCarrierAt < 0) ai.firstCarrierAt = state.t;
      UsAI.midway(state, r);
      const trigger = r && (ai.firstCarrierAt >= 0 || state.t >= 150);
      const delay = state.diff.usDelay;
      const tf16 = ai.tf.TF16;
      const tf17 = ai.tf.TF17;
      if (trigger && tf16.goAt < 0) {
        tf16.goAt = Math.max(state.t, state.t + delay);
        tf17.goAt = tf16.goAt + 60;
      }
      UsAI.taskForce(state, 'TF16', r);
      UsAI.taskForce(state, 'TF17', r);
      UsAI.search(state, r);
    },

    taskForce: function (state, id, r) {
      const ai = state.usai.tf[id];
      const g = state.groups[id];
      const live = MD.Forces.liveCarriers(state, id);
      if (live.length === 0) return;
      // Turn away for a while after being attacked.
      if (state.t - g.lastAttacked < 30 && g.lastAttackFrom) {
        g.waypoint = null;
        g.orderCourse = MD.Geo.norm360(MD.Geo.bearing(g.lastAttackFrom, g) + 20);
        g.orderSpeed = 28;
        return;
      }
      if (ai.phase === 'patrol') {
        g.orderSpeed = 5;
        if (ai.goAt >= 0 && state.t >= ai.goAt) ai.phase = 'closing';
        else return;
      }
      if (!r) return;
      const est = UsAI.project(r, state.t + 50);
      const d = MD.Geo.dist(g, est);
      if (ai.phase === 'closing' || ai.phase === 'spotting') {
        g.waypoint = { x: est.x, y: est.y };
        g.orderSpeed = 25;
        // Decks are spotted as soon as the hunt begins; the launch waits for the range to close.
        if (ai.phase === 'closing' && d <= LAUNCH_RANGE + 120) {
          let any = false;
          for (let i = 0; i < live.length; i++) {
            if (live[i].deck.state === 'idle' && !live[i].rearm && MD.Deck.spot(state, live[i]).ok) any = true;
          }
          if (any) ai.phase = 'spotting';
        }
        if (ai.phase === 'spotting') {
          const ready = live.filter(function (c) { return c.deck.state === 'spotted'; });
          const waiting = live.filter(function (c) { return c.deck.state === 'spotting'; });
          if (ready.length && waiting.length === 0 && MD.Geo.dist(g, UsAI.project(r, state.t)) <= LAUNCH_RANGE) UsAI.launch(state, id, ready, r);
        }
      } else if (ai.phase === 'launched') {
        // Steam toward the enemy to shorten the flight home, then wait for the next sighting.
        g.waypoint = null;
        g.orderCourse = MD.Geo.bearing(g, UsAI.project(r, state.t));
        g.orderSpeed = 25;
        const decksIdle = live.every(function (c) { return c.deck.state === 'idle'; });
        const airborne = state.flights.some(function (f) { return f.side === 'A' && f.kind === 'strike' && f.homeGroup === id; });
        const bombers = live.reduce(function (n, c) { return n + c.hangar.D + c.hangar.T; }, 0);
        if (decksIdle && !airborne && bombers >= 8 && r.obsT > ai.launchedAt + 20) ai.phase = 'closing';
      }
    },

    launch: function (state, id, ready, r) {
      const ai = state.usai.tf[id];
      const g = state.groups[id];
      const eta = MD.Geo.dist(g, UsAI.project(r, state.t)) / 115 * 60;
      const aim = UsAI.project(r, state.t + eta);
      const hornet = ready.filter(function (c) { return c.id === 'hornet'; })[0];
      const others = ready.filter(function (c) { return c.id !== 'hornet'; });
      if (others.length) {
        for (let i = 0; i < others.length; i++) MD.Deck.launch(state, [others[i]], aim, { dropOutOfRange: true, name: others[i].name + ' Air Group' });
      }
      if (hornet) {
        const lost = MD.Rng.chance(state, 'hornet-course:' + ai.strikes, state.diff.hornetLost);
        if (lost) {
          // The flight to nowhere: the bombers and fighters fly the wrong heading; the torpedo squadron breaks away.
          const torps = hornet.deck.pkg.T;
          hornet.deck.pkg.T = 0;
          MD.Deck.launch(state, [hornet], aim, { dropOutOfRange: true, wrongCourse: 50, name: 'HORNET Air Group' });
          if (torps > 0 && MD.Geo.dist(hornet, aim) <= MD.Data.aircraft.TBD.radiusTorp) {
            const f = MD.Air.formStrike(state, 'A', [hornet], aim, 'sea', { name: 'HORNET Torpedo Squadron' });
            f.waiting = [];
            f.elements.push({ home: 'hornet', type: 'TBD', role: 'T', n: torps, arm: 'ship', fuel: MD.Data.aircraft.TBD.radiusTorp * 2 + 60 });
            MD.Air.depart(state, f);
          } else hornet.hangar.T += torps;
        } else {
          MD.Deck.launch(state, [hornet], aim, { dropOutOfRange: true, name: 'HORNET Air Group' });
        }
      }
      ai.phase = 'launched';
      ai.launchedAt = state.t;
      ai.strikes += 1;
      ai.aim = aim;
      MD.Events.emit(state, 'info', 'A', g.name + ' launches its strike toward ' + MD.Geo.fix(aim) + '.', {});
    },

    /** Midway's land-based bombers: four separate waves once the enemy is found, and B-17s again in the afternoon. */
    midway: function (state, r) {
      const ai = state.usai;
      const m = state.midway;
      if (!r || m.hp < 35) return;
      if (!ai.midwayWaves && state.t >= 55) {
        const t0 = state.t + Math.max(0, state.diff.usDelay);
        ai.midwayWaves = [
          { at: t0 + 5, mix: { B17: 14 }, name: 'Midway B-17s' },
          { at: t0 + 10, mix: { TBF: 6, B26: 4 }, name: 'Midway Torpedo Group' },
          { at: t0 + 25, mix: { SBD: 16 }, name: 'Midway SBDs' },
          { at: t0 + 40, mix: { SB2U: 11 }, name: 'Midway Vindicators' },
        ];
      }
      if (ai.midwayWaves) {
        for (let i = 0; i < ai.midwayWaves.length; i++) {
          const w = ai.midwayWaves[i];
          if (w.sent || state.t < w.at) continue;
          w.sent = true;
          UsAI.sendFromMidway(state, w.mix, r, w.name);
        }
        const last = ai.midwayWaves[ai.midwayWaves.length - 1];
        if (!ai.b17Again && state.t >= last.at + 300 && state.t - r.obsT < 90 && (m.bombers.B17 || 0) >= 6) {
          ai.b17Again = true;
          UsAI.sendFromMidway(state, { B17: m.bombers.B17 }, r, 'Midway B-17s (afternoon)');
        }
      }
    },

    sendFromMidway: function (state, mix, r, name) {
      const m = state.midway;
      const send = {};
      let total = 0;
      let speed = Infinity;
      for (const t in mix) {
        const n = Math.min(mix[t], m.bombers[t] || 0);
        if (n <= 0) continue;
        m.bombers[t] -= n;
        send[t] = n;
        total += n;
        speed = Math.min(speed, MD.Data.aircraft[t].speed);
      }
      if (!total) return;
      const now = UsAI.project(r, state.t);
      const eta = (MD.Geo.dist({ x: 0, y: 0 }, now) / speed) * 60;
      MD.Air.launchFromMidway(state, send, UsAI.project(r, state.t + eta), name);
    },

    /** When the trail goes cold the carriers send SBDs to look. */
    search: function (state, r) {
      const ai = state.usai;
      if (state.t < 150 || state.t - ai.lastScoutAt < 150) return;
      if (r && state.t - r.obsT < 90) return;
      const tf = MD.Forces.liveCarriers(state, 'TF17').length ? 'TF17' : MD.Forces.liveCarriers(state, 'TF16').length ? 'TF16' : null;
      if (!tf) return;
      const g = state.groups[tf];
      const centre = r ? MD.Geo.bearing(g, UsAI.project(r, state.t)) : 290;
      ai.lastScoutAt = state.t;
      for (let i = 0; i < 8; i++) {
        const b = centre - 70 + i * 20;
        MD.Scouting.launch(state, 'A', tf + ' SBD scout ' + (i + 1), 'SBD', g, b, 200, tf, 0);
      }
      MD.Events.emit(state, 'info', 'A', g.name + ' launches a search ' + pad3(centre) + '° ± 70°.', {});
    },
  };

  MD.UsAI = UsAI;
})(globalThis.MD = globalThis.MD || {});
