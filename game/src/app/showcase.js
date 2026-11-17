// Screenshot scenes, opened with ?shot=1..4&seed=N. Each plays a real battle forward with the autopilot in command
// (the same engine and the same seed always give the same frame), stops at the chosen moment and freezes the clock:
//   1 the title screen, 2 a strike under way, 3 the moment the bombs hit, 4 the battle report.
(function (MD) {
  'use strict';

  const FROZEN = 1000;

  /** Steps the session's battle under the autopilot until `stop` says so (or the day ends). */
  function playUntil(session, style, stop) {
    const mem = MD.Autopilot.create(style);
    const s = session.state;
    while (!s.over && !stop(s)) MD.Sim.step(s, MD.Autopilot.orders(s, mem));
  }

  /**
   * The first battle at or after `seed` (and the minute in it) where `pred` holds, played by the autopilot
   * without drawing anything; the scene then replays that battle up to that minute.
   */
  function findMoment(seed, style, pred, tries) {
    for (let k = 0; k < tries; k++) {
      const s = MD.Sim.create({ seed: seed + k, difficulty: 'historical' });
      const mem = MD.Autopilot.create(style);
      while (!s.over) {
        if (pred(s)) return { seed: seed + k, t: s.t };
        MD.Sim.step(s, MD.Autopilot.orders(s, mem));
      }
    }
    return null;
  }

  function strikeMoment(s) {
    if (s.t < 120) return false;
    const out = s.flights.some(function (f) { return f.side === 'J' && f.kind === 'strike' && f.phase === 'out' && f.targetKind === 'sea' && MD.Air.count(f) >= 40 && f.path.length >= 12; });
    if (!out) return false;
    const scouts = s.flights.filter(function (f) { return f.side === 'J' && f.kind === 'scout' && f.phase !== 'catapult'; }).length;
    const intact = MD.Forces.sideCarriers(s, 'J').every(MD.Forces.fighting);
    return intact && scouts >= 2 && s.intel.J.some(function (r) { return r.kind === 'carriers'; });
  }

  function impactMoment(s) {
    for (let i = s.log.length - 1; i >= 0 && s.log[i].t === s.t; i--) {
      const e = s.log[i];
      if (e.kind !== 'bombing' || e.attacker !== 'J') continue;
      let fatal = 0;
      for (const id in e.tally) if (e.tally[id].before !== 'fatal' && s.carriers[id].status === 'fatal') fatal++;
      if (fatal >= 1 && Object.keys(e.tally).length >= 2) return true;
    }
    return false;
  }

  /** Shows the last few signals of the day so far, already typed. */
  function catchUpSignals(session, keep) {
    MD.Telegrams.bind(MD.App);
    const log = session.state.log;
    const shown = [];
    for (let i = log.length - 1; i >= 0 && shown.length < keep; i--) {
      const e = log[i];
      if (e.side === 'A' || !e.text || e.kind === 'deck') continue;
      shown.push(e);
    }
    shown.reverse().forEach(function (e) { MD.Telegrams.add(e, true); });
    session.logIndex = log.length;
  }

  function settle(app, frames) {
    let n = 0;
    app.onFrame = function () {
      n++;
      if (n >= frames) {
        window.__shotReady = true;
        app.onFrame = null;
      }
    };
  }

  function freezeView(session) {
    session.view.prev = MD.Renderer.snapshot(session.state);
    session.view.alpha = 1;
    session.paused = false;
  }

  const Showcase = {
    run: function (app, n, seed) {
      app.fixedNow = FROZEN;
      try {
        window.localStorage.setItem('midway-dawn-tutorial-v1', '1');
      } catch (e) {
        // storage unavailable: the tutorial is hidden below anyway
      }
      if (n === 1) {
        app.showTitle();
        app.fixedNow = 14.2;
        settle(app, 3);
        return;
      }
      if (n === 4) return Showcase.debrief(app, seed);
      const found = findMoment(seed, 'aggressive', n === 2 ? strikeMoment : impactMoment, 40) || { seed: seed, t: 400 };
      app.startBattle(found.seed, 'historical');
      document.getElementById('tutorial').classList.add('hidden');
      Showcase.until = found.t;
      if (n === 2) Showcase.strike(app);
      else Showcase.impact(app);
      settle(app, 4);
    },

    /** A strike on its way out, the search lines fanned across the sea, the sighting that sent it. */
    strike: function (app) {
      const session = app.session;
      playUntil(session, 'aggressive', function (s) { return s.t >= Showcase.until; });
      const s = session.state;
      catchUpSignals(session, 7);
      freezeView(session);
      const strike = s.flights.filter(function (f) { return f.side === 'J' && f.kind === 'strike' && f.phase === 'out'; })[0];
      const reps = s.intel.J.filter(function (r) { return r.kind === 'carriers'; });
      const rep = reps[reps.length - 1];
      const kb = s.groups.KB;
      const ui = session.view.ui;
      if (rep) {
        ui.selectedReport = rep.id;
        ui.target = { x: rep.x, y: rep.y };
      }
      ui.selected = 'kaga';
      const pts = [kb, strike || kb, rep || kb];
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      pts.forEach(function (p) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      });
      const cam = app.camera;
      const zoom = Math.min((cam.w - cam.insetLeft - cam.insetRight - 120) / (x1 - x0 + 80), (cam.h - 140) / (y1 - y0 + 80));
      cam.jump({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, Math.max(1.0, Math.min(2.6, zoom)));
      MD.Cards.update();
    },

    /** The bombs falling on an American carrier: tracers, flak, fires, the strike overhead. */
    impact: function (app) {
      const session = app.session;
      let hit = null;
      playUntil(session, 'aggressive', function (s) { return s.t >= Showcase.until; });
      const log = session.state.log;
      for (let i = log.length - 1; i >= 0 && log[i].t === session.state.t; i--) {
        if (log[i].kind === 'bombing' && log[i].attacker === 'J') hit = log[i];
      }
      const s = session.state;
      catchUpSignals(session, 6);
      freezeView(session);
      if (!hit) return;
      const g = s.groups[hit.group];
      g.seenT = s.t;
      const now = FROZEN;
      for (let i = 0; i < s.log.length; i++) {
        const e = s.log[i];
        if (e.t !== s.t) continue;
        if (e.kind === 'airbattle') MD.Effects.fromEvent(e, s, now - 1.7);
        else if (e.kind === 'bombing') MD.Effects.fromEvent(e, s, now - 2.1);
        else if (e.kind === 'damage') MD.Effects.fromEvent(e, s, now - 2.5);
      }
      // A second wave of bursts still landing, so the frame shows the attack at its height.
      for (const id in hit.tally) {
        const c = s.carriers[id];
        MD.Effects.explosion({ x: c.x + 0.6, y: c.y - 0.4 }, now - 0.35, false);
        MD.Effects.explosion({ x: c.x - 0.5, y: c.y + 0.3 }, now - 0.2, true);
      }
      for (let i = 0; i < 4; i++) MD.Effects.splash({ x: g.x + Math.sin(i * 1.7) * 3, y: g.y + Math.cos(i * 2.3) * 3 }, now - 0.3 - i * 0.2);
      app.camera.jump({ x: g.x + 3, y: g.y - 2 }, 3.4);
      MD.Cards.update();
    },

    /** The battle report of a won day, with both sides' tracks revealed behind it. */
    debrief: function (app, seed) {
      let pick = seed;
      for (let k = 0; k < 40; k++) {
        const s = MD.Sim.autoplay({ seed: seed + k, difficulty: 'historical', style: 'aggressive' });
        if (s.result === 'victory' && MD.Sim.tally(s, 'J').lost >= 1 && s.midway.hp < 100) {
          pick = seed + k;
          break;
        }
      }
      app.startBattle(pick, 'historical');
      document.getElementById('tutorial').classList.add('hidden');
      playUntil(app.session, 'aggressive', function () { return false; });
      app.session.logIndex = app.session.state.log.length;
      freezeView(app.session);
      app.showDebrief();
      settle(app, 4);
    },
  };

  MD.Showcase = Showcase;
})(globalThis.MD = globalThis.MD || {});
