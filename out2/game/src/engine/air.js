// Aircraft in flight: strikes form up over their carriers, fly out on a heading, search the sea where the enemy
// was reported, attack what they find, fly home and circle until a deck is clear to land on. Every element of a
// flight carries its own fuel; an element that runs dry ditches. Scouts are flights too (see scouting.js).
(function (MD) {
  'use strict';

  const Air = {
    newId: function (state, prefix) {
      state.nextId += 1;
      return prefix + state.nextId;
    },

    recordLoss: function (state, side, type, n) {
      if (!n) return;
      const L = state.losses[side];
      L.planes += n;
      L.byType[type] = (L.byType[type] || 0) + n;
    },

    /** A strike's name: "1st Strike" and so on, per side. */
    strikeName: function (state, side, toMidway) {
      state.strikeCount[side] += 1;
      const n = state.strikeCount[side];
      const ord = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';
      if (side === 'J') return ord + ' Strike' + (toMidway ? ' (Midway)' : '');
      return 'US Strike ' + n;
    },

    /** Opens a strike that the given carriers' launches will fill. */
    formStrike: function (state, side, carriers, aim, targetKind, opts) {
      const first = carriers[0];
      const f = {
        id: Air.newId(state, 'f'),
        side: side,
        kind: 'strike',
        name: (opts && opts.name) || Air.strikeName(state, side, targetKind === 'midway'),
        x: first.x,
        y: first.y,
        heading: MD.Geo.bearing(first, aim),
        speed: 0,
        phase: 'forming',
        aim: { x: aim.x, y: aim.y },
        trueAim: { x: aim.x, y: aim.y },
        targetKind: targetKind,
        targetGroup: null,
        origin: { x: first.x, y: first.y },
        elements: [],
        waiting: carriers.map(function (c) { return c.id; }),
        searchLeft: MD.Data.combat.searchMinutes,
        searched: 0,
        missed: {},
        launchedAt: state.t,
        holdSince: -1,
        path: [{ x: first.x, y: first.y }],
        seenBy: {},
        homeGroup: first.group,
        nav: first.nav,
        result: null,
      };
      if (opts && opts.wrongCourse) {
        // A flight that takes the wrong heading: it flies to a point well off the reported position.
        const brg = MD.Geo.bearing(first, aim) + opts.wrongCourse;
        f.aim = MD.Geo.polar(brg, MD.Geo.dist(first, aim), first);
        f.wrongCourse = true;
      }
      state.flights.push(f);
      return f;
    },

    /** A carrier's launch is finished: its planes join the strike (a few lost in take-off accidents). */
    joinStrike: function (state, c, flightId, pkg) {
      const f = Air.find(state, flightId);
      if (!f) return;
      const A = MD.Data.aircraft;
      const roles = ['D', 'T', 'F'];
      let accidents = 0;
      for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        const n0 = pkg[role];
        if (!n0) continue;
        const type = c.types[role];
        const crash = MD.Rng.binomial(state, 'takeoff:' + c.id + ':' + f.id + ':' + role, n0, MD.Data.deck.launchAccident);
        accidents += crash;
        Air.recordLoss(state, c.side, type, crash);
        const arm = role === 'D' ? pkg.armD : role === 'T' ? pkg.armT : null;
        const ac = A[type];
        const radius = role === 'T' && arm === 'ship' ? ac.radiusTorp : ac.radius;
        f.elements.push({ home: c.id, type: type, role: role, n: n0 - crash, arm: arm, fuel: radius * 2 + 60 });
      }
      f.waiting = f.waiting.filter(function (id) { return id !== c.id; });
      if (f.waiting.length === 0) Air.depart(state, f);
      if (accidents > 0 && c.side === 'J') MD.Events.emit(state, 'flight', 'J', MD.Deck.label(c) + ': ' + accidents + ' aircraft lost in take-off accidents.', { carrier: c.id });
    },

    depart: function (state, f) {
      f.phase = 'out';
      f.speed = Air.cruise(f);
      f.heading = MD.Geo.bearing(f, f.aim);
      const n = Air.count(f);
      MD.Events.emit(state, 'flight', f.side, f.name + ' airborne: ' + n + ' aircraft, ' + Math.round(MD.Geo.dist(f, f.aim)) + ' nm to ' + (f.targetKind === 'midway' ? 'Midway' : 'the target') + '.', { flight: f.id, x: f.x, y: f.y, launch: true });
    },

    /** A land-based strike from Midway's airfield. */
    launchFromMidway: function (state, mix, aim, name) {
      const A = MD.Data.aircraft;
      const f = Air.formStrike(state, 'A', [{ x: 0, y: 0, group: 'midway', nav: MD.Data.midway.nav }], aim, 'sea', { name: name });
      f.waiting = [];
      for (const type in mix) {
        const n = mix[type];
        if (!n) continue;
        const ac = A[type];
        f.elements.push({ home: 'midway', type: type, role: ac.role === 'H' ? 'H' : ac.role, n: n, arm: ac.role === 'T' ? 'ship' : 'ship', fuel: (ac.radiusTorp || ac.radius) * 2 + 60 });
      }
      f.homeGroup = 'midway';
      Air.depart(state, f);
      return f;
    },

    find: function (state, id) {
      for (let i = 0; i < state.flights.length; i++) if (state.flights[i].id === id) return state.flights[i];
      return null;
    },

    count: function (f) {
      let n = 0;
      for (let i = 0; i < f.elements.length; i++) n += f.elements[i].n;
      return n;
    },

    countRole: function (f, role) {
      let n = 0;
      for (let i = 0; i < f.elements.length; i++) if (f.elements[i].role === role) n += f.elements[i].n;
      return n;
    },

    /** A flight keeps together at its slowest member's speed. */
    cruise: function (f) {
      const A = MD.Data.aircraft;
      let s = Infinity;
      for (let i = 0; i < f.elements.length; i++) if (f.elements[i].n > 0) s = Math.min(s, A[f.elements[i].type].speed);
      return s === Infinity ? 120 : s;
    },

    pruneFlights: function (state) {
      state.flights = state.flights.filter(function (f) {
        return f.phase !== 'gone' && (f.phase === 'forming' || Air.count(f) > 0);
      });
    },

    /** Where a returning flight is going: its home carrier's group, a carrier that still fights, or Midway. */
    homePoint: function (state, f) {
      if (f.homeGroup === 'midway') return { x: 0, y: 0 };
      for (let i = 0; i < f.elements.length; i++) {
        const e = f.elements[i];
        if (e.n <= 0) continue;
        let c = state.carriers[e.home];
        if (!c || !MD.Forces.fighting(c)) {
          const alt = Air.rehome(state, f.side, c ? c.group : f.homeGroup);
          if (alt) {
            e.home = alt.id;
            c = alt;
          }
        }
        if (c) return state.groups[c.group];
      }
      return state.groups[f.homeGroup] || { x: 0, y: 0 };
    },

    /** The carrier a homeless element lands on: one that still fights, in the same group if possible. */
    rehome: function (state, side, groupId) {
      const same = MD.Forces.liveCarriers(state, groupId);
      if (same.length) return same[0];
      const all = MD.Forces.sideCarriers(state, side).filter(MD.Forces.fighting);
      return all.length ? all[0] : null;
    },

    /** Burns a minute of fuel; elements that run dry ditch. */
    burn: function (state, f) {
      const step = f.speed / 60;
      let ditched = 0;
      for (let i = 0; i < f.elements.length; i++) {
        const e = f.elements[i];
        if (e.n <= 0) continue;
        e.fuel -= step;
        if (e.fuel <= 0) {
          ditched += e.n;
          Air.recordLoss(state, f.side, e.type, e.n);
          e.n = 0;
        }
      }
      if (ditched > 0) {
        MD.Events.emit(state, 'flight', f.side, f.name + ': ' + ditched + ' aircraft out of fuel, ditched at sea.', { flight: f.id, x: f.x, y: f.y });
      }
    },

    /** Enemy groups this flight could see from where it is now. */
    lookForShips: function (state, f, bonus) {
      const C = MD.Data.combat;
      let best = null;
      let bestD = Infinity;
      for (const id in state.groups) {
        const g = state.groups[id];
        if (g.side === f.side || f.missed[id]) continue;
        const ships = MD.Forces.carriersOf(state, id).filter(function (c) { return c.status !== 'sunk'; });
        if (ships.length === 0) continue;
        const vis = MD.Weather.visibility(state, g.x, g.y);
        const reach = C.strikeSight * (0.6 + 0.4 * vis) + bonus;
        const d = MD.Geo.dist(f, g);
        if (d > reach) continue;
        // Spotting them at all depends on the flight's navigation and the weather; a miss is final for this flight.
        const pFind = f.nav * (0.75 + 0.25 * vis);
        if (!MD.Rng.chance(state, 'find:' + f.id + ':' + id, pFind)) {
          f.missed[id] = true;
          continue;
        }
        if (d < bestD) {
          bestD = d;
          best = g;
        }
      }
      return best;
    },

    tick: function (state) {
      for (let i = 0; i < state.flights.length; i++) {
        const f = state.flights[i];
        if (f.kind === 'scout') MD.Scouting.tickScout(state, f);
        else Air.tickStrike(state, f);
      }
      Air.pruneFlights(state);
    },

    tickStrike: function (state, f) {
      const G = MD.Geo;
      if (f.phase === 'forming') {
        const c = state.carriers[f.waiting[0]];
        if (c) {
          f.x = c.x;
          f.y = c.y;
        }
        return;
      }
      const step = f.speed / 60;
      if (f.phase === 'out') {
        const p = G.stepToward(f, f.aim, step);
        f.heading = G.bearing(f, f.aim);
        f.x = p.x;
        f.y = p.y;
        Air.burn(state, f);
        if (f.targetKind === 'midway') {
          if (p.arrived) {
            MD.Combat.resolveMidway(state, f);
            f.phase = 'return';
          }
        } else {
          const g = Air.lookForShips(state, f, 0);
          if (g) {
            f.phase = 'attack';
            f.targetGroup = g.id;
          } else if (p.arrived) {
            f.phase = 'search';
          }
        }
      } else if (f.phase === 'search') {
        // A widening box search around the reported position.
        f.searched += 1;
        f.searchLeft -= 1;
        f.heading = G.norm360(f.heading + 14);
        const p = G.advance(f, f.heading, f.speed, 1);
        f.x = p.x;
        f.y = p.y;
        Air.burn(state, f);
        const g = Air.lookForShips(state, f, f.searched * 1.6);
        if (g) {
          f.phase = 'attack';
          f.targetGroup = g.id;
        } else if (f.searchLeft <= 0) {
          f.phase = 'return';
          f.result = 'none';
          MD.Events.emit(state, 'flight', f.side, f.name + ': no contact at the reported position. Returning.', { flight: f.id, x: f.x, y: f.y, pause: f.side === 'J' });
        }
      } else if (f.phase === 'attack') {
        const g = state.groups[f.targetGroup];
        const p = G.stepToward(f, g, step);
        f.heading = G.bearing(f, g);
        f.x = p.x;
        f.y = p.y;
        Air.burn(state, f);
        if (G.dist(f, g) < 5) {
          MD.Combat.resolveStrike(state, f, g);
          f.phase = 'return';
        }
      } else if (f.phase === 'return') {
        const home = Air.homePoint(state, f);
        const p = G.stepToward(f, home, step);
        f.heading = G.bearing(f, home);
        f.x = p.x;
        f.y = p.y;
        Air.burn(state, f);
        if (G.dist(f, home) < 8) {
          if (f.homeGroup === 'midway') Air.landAtMidway(state, f);
          else {
            f.phase = 'holding';
            f.holdSince = state.t;
            MD.Events.emit(state, 'flight', f.side, f.name + ' back over the fleet: ' + Air.count(f) + ' aircraft waiting to land.', { flight: f.id, x: f.x, y: f.y, holding: true });
          }
        }
      } else if (f.phase === 'holding') {
        const home = Air.homePoint(state, f);
        f.heading = G.norm360(f.heading + 9);
        const orbit = G.polar(f.heading, 6, home);
        f.x = orbit.x;
        f.y = orbit.y;
        Air.burn(state, f);
        // Past their reserve they start to go into the sea, a few at a time.
        if (state.t - f.holdSince > MD.Data.deck.holdingFuel) {
          let lost = 0;
          for (let i = 0; i < f.elements.length; i++) {
            const e = f.elements[i];
            const k = MD.Rng.binomial(state, 'hold:' + f.id + ':' + i + ':' + state.t, e.n, 0.08);
            e.n -= k;
            lost += k;
            Air.recordLoss(state, f.side, e.type, k);
          }
          if (lost > 0 && state.t % 5 === 0) MD.Events.emit(state, 'flight', f.side, f.name + ': ' + lost + ' aircraft ditched waiting for a clear deck.', { flight: f.id, x: f.x, y: f.y });
        }
        // No deck left anywhere: they all go into the sea beside the destroyers.
        if (!Air.rehome(state, f.side, f.homeGroup)) {
          for (let i = 0; i < f.elements.length; i++) {
            Air.recordLoss(state, f.side, f.elements[i].type, f.elements[i].n);
            f.elements[i].n = 0;
          }
        }
      }
      if (state.t % 3 === 0) f.path.push({ x: f.x, y: f.y });
    },

    landAtMidway: function (state, f) {
      const m = state.midway;
      let lost = 0;
      for (let i = 0; i < f.elements.length; i++) {
        const e = f.elements[i];
        if (m.hp <= 0) {
          lost += e.n;
          Air.recordLoss(state, 'A', e.type, e.n);
        } else {
          m.bombers[e.type] = (m.bombers[e.type] || 0) + e.n;
        }
        e.n = 0;
      }
      f.phase = 'gone';
      if (lost) MD.Events.emit(state, 'flight', 'A', f.name + ': Midway runway destroyed, ' + lost + ' aircraft lost landing.', { x: 0, y: 0 });
    },
  };

  MD.Air = Air;
})(globalThis.MD = globalThis.MD || {});
