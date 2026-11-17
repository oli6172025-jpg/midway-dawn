// Search and the fog of war. Search planes fly a dog-leg out from the fleet and back; one that passes close to an
// enemy force sights it with probability 0.6 (less under cloud), radios a report 3-15 minutes later (if the radio
// gets through), names the ships correctly 55% of the time (D4Y: 70%), misidentifies them 15% of the time, and puts
// them 5-35 nm from where they are (8%: another 15-40 nm). A plane that finds the enemy shadows it and sends updates.
// Lookouts (and American radar) also watch the sky for incoming raids.
(function (MD) {
  'use strict';

  function scoutType(type) {
    const ac = MD.Data.aircraft[type];
    return { speed: ac.speed, comm: ac.comm || 0.85, ident: ac.ident || 0.55, radius: ac.radius };
  }

  function pad3(n) {
    n = Math.round(MD.Geo.norm360(n));
    return (n < 10 ? '00' : n < 100 ? '0' : '') + n;
  }

  const Scouting = {
    createScouts: function (state) {
      state.scouts = MD.Data.scouts.map(function (s) {
        return { id: s.id, name: s.name, ship: s.ship, type: s.type, status: 'ready', readyAt: 0, flight: null };
      });
    },

    readyScouts: function (state) {
      return state.scouts.filter(function (s) { return s.status === 'ready' && state.t >= s.readyAt; });
    },

    /** Japanese search order: the next ready plane (a D4Y if asked and available) flies the line. */
    order: function (state, bearing, range, preferType) {
      const ready = Scouting.readyScouts(state);
      if (ready.length === 0) return { ok: false, msg: 'No search planes ready — they are all out or being refuelled.' };
      let s = ready[0];
      if (preferType) {
        const pref = ready.filter(function (r) { return r.type === preferType; });
        if (pref.length) s = pref[0];
      } else {
        const floats = ready.filter(function (r) { return r.type === 'E13A'; });
        if (floats.length) s = floats[0];
      }
      const st = scoutType(s.type);
      const r = Math.max(80, Math.min(range, st.radius - 40));
      const kb = state.groups.KB;
      let delay = 0;
      if (s.type === 'E13A' && MD.Rng.chance(state, 'catapult:' + s.id + ':' + state.t, MD.Data.search.catapultDelayChance)) {
        delay = MD.Rng.int(state, 'catapult-min:' + s.id + ':' + state.t, 5, MD.Data.search.catapultDelayMax);
      }
      const f = Scouting.launch(state, 'J', s.name, s.type, kb, bearing, r, 'KB', delay);
      s.status = 'out';
      s.flight = f.id;
      f.scoutId = s.id;
      const note = delay > 0 ? ' Catapult trouble aboard ' + s.ship + ': launch delayed ' + delay + ' min.' : '';
      return { ok: true, msg: s.name + ' searching ' + pad3(bearing) + '°, out to ' + Math.round(r) + ' nm.' + note };
    },

    /** Any side's search plane: out on `bearing` to `range`, a leg across to port, then home. */
    launch: function (state, side, name, type, from, bearing, range, homeGroup, delay, startOut) {
      const st = scoutType(type);
      const start = startOut ? MD.Geo.polar(bearing, startOut, from) : { x: from.x, y: from.y };
      const p1 = MD.Geo.polar(bearing, range, from);
      const p2 = MD.Geo.polar(bearing - 90, MD.Data.search.legCross, p1);
      const f = {
        id: MD.Air.newId(state, 's'),
        side: side,
        kind: 'scout',
        name: name,
        type: type,
        x: start.x,
        y: start.y,
        heading: bearing,
        speed: st.speed,
        phase: delay > 0 ? 'catapult' : 'out',
        departAt: state.t + (delay || 0),
        route: [p1, p2],
        leg: 0,
        homeGroup: homeGroup,
        elements: [{ home: homeGroup, type: type, role: 'S', n: 1, arm: null, fuel: 9999 }],
        rolled: {},
        shadow: null,
        updates: 0,
        path: [{ x: start.x, y: start.y }],
        seenBy: {},
        launchedAt: state.t,
      };
      state.flights.push(f);
      return f;
    },

    tickScout: function (state, f) {
      const G = MD.Geo;
      const S = MD.Data.search;
      if (f.phase === 'catapult') {
        const g = state.groups[f.homeGroup];
        if (g) {
          f.x = g.x;
          f.y = g.y;
        }
        if (state.t >= f.departAt) f.phase = 'out';
        return;
      }
      const step = f.speed / 60;
      if (f.phase === 'out') {
        const target = f.route[f.leg];
        const p = G.stepToward(f, target, step);
        f.heading = G.bearing(f, target);
        f.x = p.x;
        f.y = p.y;
        if (p.arrived) {
          f.leg += 1;
          if (f.leg >= f.route.length) f.phase = 'return';
        }
      } else if (f.phase === 'shadow') {
        const g = state.groups[f.shadow.group];
        const keep = G.polar(f.shadow.bearing, 14, g);
        const p = G.stepToward(f, keep, step);
        f.heading = G.bearing(f, g);
        f.x = p.x;
        f.y = p.y;
        Scouting.tickShadow(state, f, g);
      } else if (f.phase === 'return') {
        const home = f.homeGroup === 'midway' ? { x: 0, y: 0 } : state.groups[f.homeGroup];
        const p = G.stepToward(f, home, step);
        f.heading = G.bearing(f, home);
        f.x = p.x;
        f.y = p.y;
        if (p.arrived || G.dist(f, home) < 4) {
          f.phase = 'gone';
          if (f.scoutId) {
            const s = state.scouts.filter(function (x) { return x.id === f.scoutId; })[0];
            if (s) {
              s.status = 'ready';
              s.readyAt = state.t + 30;
              s.flight = null;
            }
          }
          return;
        }
      }
      if (f.phase === 'out' || f.phase === 'return') Scouting.sweep(state, f);
      if (state.t % 3 === 0) f.path.push({ x: f.x, y: f.y });
    },

    /** Looks for enemy ships within sight; the first sighting of a group starts a shadow. */
    sweep: function (state, f) {
      const S = MD.Data.search;
      const visHere = MD.Weather.visibility(state, f.x, f.y);
      const reach = S.sightRadius * (0.6 + 0.4 * visHere);
      for (const id in state.groups) {
        const g = state.groups[id];
        if (g.side === f.side) continue;
        if (MD.Forces.carriersOf(state, id).every(function (c) { return c.status === 'sunk'; })) continue;
        // One look per quarter hour while in sight: a pass usually gives two or three chances.
        const legKey = id + ':' + Math.floor(state.t / 15);
        if (f.rolled[legKey]) continue;
        if (MD.Geo.dist(f, g) > reach) continue;
        f.rolled[legKey] = true;
        const base = f.side === 'J' ? state.diff.jSearch : state.diff.usSearch;
        const p = base * MD.Weather.visibility(state, g.x, g.y);
        if (!MD.Rng.chance(state, 'sight:' + f.id + ':' + legKey, p)) continue;
        f.phase = 'shadow';
        f.shadow = { group: id, until: state.t + S.shadowMinutes, next: state.t + S.shadowEvery, bearing: MD.Geo.bearing(g, f) };
        Scouting.report(state, f, g, 0);
        return;
      }
    },

    tickShadow: function (state, f, g) {
      const S = MD.Data.search;
      const sh = f.shadow;
      const capUp = MD.Forces.carriersOf(state, g.id).reduce(function (n, c) { return n + c.cap.up; }, 0);
      if (state.t % 10 === 0 && capUp > 0 && MD.Rng.chance(state, 'shadowloss:' + f.id + ':' + state.t, S.shadowLoss * (g.side === 'A' ? 1.5 : 1))) {
        MD.Air.recordLoss(state, f.side, f.type, 1);
        f.elements[0].n = 0;
        f.phase = 'gone';
        if (f.scoutId) {
          const s = state.scouts.filter(function (x) { return x.id === f.scoutId; })[0];
          if (s) s.status = 'lost';
        }
        if (f.side === 'J') MD.Events.emit(state, 'flight', 'J', f.name + ' has stopped transmitting — presumed shot down while shadowing.', { x: f.x, y: f.y });
        else MD.Events.emit(state, 'info', 'J', 'Our fighters shot down an enemy ' + (f.type === 'PBY' ? 'flying boat' : 'scout plane') + ' shadowing the fleet.', { x: f.x, y: f.y });
        return;
      }
      if (state.t >= sh.next) {
        f.updates += 1;
        sh.next = state.t + S.shadowEvery;
        Scouting.report(state, f, g, f.updates);
      }
      if (state.t >= sh.until || g.speed === 0) {
        f.phase = 'return';
        f.shadow = null;
      }
    },

    /** Composes a sighting report with all its errors and queues it for delivery. */
    report: function (state, f, g, update) {
      const S = MD.Data.search;
      const R = MD.Rng;
      const key = 'rep:' + f.id + ':' + g.id + ':' + update;
      const st = scoutType(f.type);
      const live = MD.Forces.carriersOf(state, g.id).filter(function (c) { return c.status !== 'sunk'; });
      const fighting = live.filter(MD.Forces.fighting).length;
      if (!R.chance(state, key + ':comm', st.comm)) {
        if (f.side === 'J' && update === 0) MD.Events.emit(state, 'info', 'J', f.name + ': transmission garbled — message unreadable.', {});
        return;
      }
      let delay = R.int(state, key + ':delay', S.reportDelayMin, S.reportDelayMax);
      if (f.side === 'A') delay = Math.round(delay * state.diff.usCommDelay) + (f.homeGroup === 'midway' ? R.int(state, key + ':relay', 5, 15) : 0);
      const pIdent = Math.min(0.9, st.ident + 0.15 * update);
      const roll = R.u(state, key + ':ident');
      let kind = roll < pIdent ? 'carriers' : roll < pIdent + S.misident ? 'ships' : 'unknown';
      if (fighting === 0) kind = 'wrecks';
      let err = R.range(state, key + ':err', S.errMin, S.errMax);
      if (R.chance(state, key + ':bias', S.biasChance)) err += R.range(state, key + ':biasnm', S.biasMin, S.biasMax);
      const at = MD.Geo.polar(R.range(state, key + ':errdir', 0, 360), err, g);
      const ships = live.length + g.escorts + R.int(state, key + ':ships', -2, 2);
      const course = MD.Geo.norm360(g.course + R.range(state, key + ':course', -25, 25));
      const speed = Math.max(0, Math.round(g.speed + R.range(state, key + ':speed', -4, 4)));
      const rep = {
        id: MD.Air.newId(state, 'r'),
        side: f.side,
        obsT: state.t,
        t: state.t + delay,
        x: at.x,
        y: at.y,
        err: 25,
        kind: kind,
        carriers: kind === 'carriers' ? fighting : kind === 'wrecks' ? live.length : 0,
        ships: ships,
        course: course,
        speed: speed,
        source: f.name,
        truth: g.id,
        update: update,
      };
      state.pending.push(rep);
    },

    /** A rough fix from radar or returning raiders: low accuracy, no identification. */
    radarFix: function (state, side, p, key, delay) {
      const at = MD.Geo.polar(MD.Rng.range(state, key + ':dir', 0, 360), MD.Rng.range(state, key + ':nm', 10, 30), p);
      state.pending.push({
        id: MD.Air.newId(state, 'r'), side: side, obsT: state.t, t: state.t + delay, x: at.x, y: at.y, err: 40, kind: 'unknown',
        carriers: 0, ships: 0, course: MD.Geo.norm360(p.course + MD.Rng.range(state, key + ':crs', -15, 15)), speed: Math.round(p.speed),
        source: 'Radar plot', truth: 'KB', update: 0,
      });
    },

    /** Reports whose transmission time has come reach their side. */
    deliver: function (state) {
      const still = [];
      for (let i = 0; i < state.pending.length; i++) {
        const r = state.pending[i];
        if (r.t > state.t) {
          still.push(r);
          continue;
        }
        state.intel[r.side].push(r);
        if (r.side === 'J') {
          MD.Events.emit(state, 'report', 'J', Scouting.telegram(r), {
            report: r.id, x: r.x, y: r.y, urgent: r.kind === 'carriers', pause: r.update === 0 || r.kind === 'carriers',
          });
        }
      }
      state.pending = still;
    },

    /** The telegram text, in the clipped style of a search plane's report. */
    telegram: function (r) {
      const where = 'bearing ' + pad3(MD.Geo.bearing({ x: 0, y: 0 }, r)) + '°, ' + Math.round(MD.Geo.dist({ x: 0, y: 0 }, r)) + ' nm from Midway';
      const motion = 'Course ' + pad3(r.course) + '°, speed ' + r.speed + ' kt.';
      const stamp = MD.Geo.clock(r.obsT).replace(':', '');
      if (r.kind === 'carriers') {
        return r.source + ' ' + stamp + ': Enemy force sighted, ' + where + '. ' + r.ships + ' ships, accompanied by what appears to be ' + (r.carriers > 1 ? r.carriers + ' carriers' : 'a carrier') + '. ' + motion;
      }
      if (r.kind === 'wrecks') {
        return r.source + ' ' + stamp + ': ' + (r.carriers > 1 ? r.carriers + ' enemy carriers' : 'Enemy carrier') + ' burning and dead in the water, ' + where + '.';
      }
      if (r.kind === 'ships') {
        return r.source + ' ' + stamp + ': ' + Math.max(4, r.ships - 2) + ' enemy cruisers and destroyers, ' + where + '. ' + motion;
      }
      return r.source + ' ' + stamp + ': Sighted what appears to be ' + r.ships + ' enemy surface units, ' + where + '. ' + motion;
    },

    /** Lookouts, radar and the sky: who can see whose aircraft and ships this minute. */
    watch: function (state) {
      const kb = state.groups.KB;
      const jFlights = state.flights.filter(function (f) { return f.side === 'J' && f.phase !== 'catapult' && f.phase !== 'forming'; });
      for (let i = 0; i < state.flights.length; i++) {
        const f = state.flights[i];
        if (f.side === 'A') {
          const d = MD.Geo.dist(f, kb);
          const reach = 26 * (0.6 + 0.4 * MD.Weather.visibility(state, f.x, f.y));
          if (d <= reach) {
            f.seenT = state.t;
            if (!f.seenBy.J && f.kind === 'strike' && (f.phase === 'out' || f.phase === 'attack' || f.phase === 'search')) {
              f.seenBy.J = true;
              const n = MD.Air.count(f);
              MD.Events.emit(state, 'raid', 'J', 'Lookouts: enemy aircraft bearing ' + pad3(MD.Geo.bearing(kb, f)) + '°, about ' + (Math.round(n / 5) * 5 || n) + ' planes, closing!', {
                x: f.x, y: f.y, urgent: true, pause: true, flight: f.id,
              });
            } else if (!f.seenBy.J && f.kind === 'scout' && f.phase === 'shadow' && MD.Rng.chance(state, 'spotpby:' + f.id, 0.7)) {
              f.seenBy.J = true;
              if (state.t - (state.shadowWarnAt || -999) > 45) {
                state.shadowWarnAt = state.t;
                MD.Events.emit(state, 'info', 'J', 'An enemy ' + (f.type === 'PBY' ? 'flying boat' : 'scout plane') + ' is shadowing the fleet. We have been found.', { x: f.x, y: f.y, urgent: true });
              }
            }
          } else {
            for (let j = 0; j < jFlights.length; j++) {
              if (MD.Geo.dist(f, jFlights[j]) < 18) {
                f.seenT = state.t;
                break;
              }
            }
          }
        } else if (f.kind === 'strike' && (f.phase === 'out' || f.phase === 'search' || f.phase === 'attack')) {
          // American radar: about 60 nm. CAP scrambles every fighter it can get up.
          for (const id in state.groups) {
            const g = state.groups[id];
            if (g.side !== 'A' || f.seenBy['A' + id] || MD.Geo.dist(f, g) > 60) continue;
            f.seenBy['A' + id] = true;
            const carriers = MD.Forces.liveCarriers(state, id);
            for (let k = 0; k < carriers.length; k++) {
              const c = carriers[k];
              if (c.deck.state !== 'idle' && c.deck.state !== 'recovering') continue;
              const n = Math.min(c.hangar.F, Math.max(0, 22 - c.cap.up));
              c.hangar.F -= n;
              c.cap.up += n;
            }
            MD.Events.emit(state, 'info', 'A', g.name + ' radar: raid inbound, CAP scrambled.', {});
          }
        }
      }
      // Enemy ships under the eyes of our aircraft are shown where they really are.
      for (const id in state.groups) {
        const g = state.groups[id];
        if (g.side !== 'A') continue;
        for (let j = 0; j < jFlights.length; j++) {
          const jf = jFlights[j];
          const reach = (jf.kind === 'scout' ? 28 : 32) * (0.6 + 0.4 * MD.Weather.visibility(state, g.x, g.y));
          const eyes = jf.kind === 'scout' ? jf.phase === 'shadow' && jf.shadow && jf.shadow.group === id : !jf.missed[id] && jf.phase !== 'holding';
          if (eyes && MD.Geo.dist(jf, g) <= reach) {
            g.seenT = state.t;
            g.seenAt = { x: g.x, y: g.y };
            break;
          }
        }
      }
    },
  };

  MD.Scouting = Scouting;
})(globalThis.MD = globalThis.MD || {});
