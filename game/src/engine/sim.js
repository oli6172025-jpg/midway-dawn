// The simulation's front door: a new battle for a seed and difficulty, the player's orders, one-minute steps,
// the score and the verdict. Everything is deterministic: the same seed and the same orders at the same minutes
// always produce the same day.
(function (MD) {
  'use strict';

  function ok(msg) {
    return { ok: true, msg: msg };
  }
  function no(msg) {
    return { ok: false, msg: msg };
  }

  const Sim = {
    create: function (opts) {
      opts = opts || {};
      const seed = (opts.seed >>> 0) || 1;
      const difficulty = MD.Data.difficulty[opts.difficulty] ? opts.difficulty : 'historical';
      const state = {
        seed: seed,
        difficulty: difficulty,
        diff: MD.Data.difficulty[difficulty],
        t: 0,
        over: false,
        result: null,
        nextId: 0,
        log: [],
        flights: [],
        pending: [],
        intel: { J: [], A: [] },
        losses: { J: { planes: 0, byType: {} }, A: { planes: 0, byType: {} } },
        strikeCount: { J: 0, A: 0 },
        midway: {
          hp: MD.Data.midway.hp,
          fighters: Object.assign({}, MD.Data.midway.fighters),
          bombers: Object.assign({}, MD.Data.midway.bombers),
          ruinedAt: -1,
        },
        wind: { from: 110, kt: 9 },
      };
      state.fronts = MD.Weather.createFronts(state);
      MD.Forces.createFleets(state);
      MD.Scouting.createScouts(state);
      Sim.setTheScene(state);
      MD.UsAI.init(state);
      MD.Events.emit(state, 'info', 'J', 'Dawn, 4 June 1942. Kido Butai is 240 nm north-west of Midway. Hiryu and Soryu have the first Midway strike on deck; Akagi and Kaga hold their bombers armed with land bombs. Find the American carriers before they find you.', { pause: false });
      return state;
    },

    /** 04:30: the first Midway strike is spotted on Hiryu and Soryu; Akagi and Kaga keep land bombs below. */
    setTheScene: function (state) {
      const C = state.carriers;
      C.akagi.arm = { D: 'land', T: 'land' };
      C.kaga.arm = { D: 'land', T: 'land' };
      C.hiryu.arm = { D: 'ship', T: 'land' };
      C.soryu.arm = { D: 'ship', T: 'land' };
      const ids = ['hiryu', 'soryu'];
      for (let i = 0; i < ids.length; i++) {
        const c = C[ids[i]];
        const pkg = { D: 0, T: c.hangar.T, F: 9, armD: 'ship', armT: 'land' };
        c.hangar.T -= pkg.T;
        c.hangar.F -= pkg.F;
        c.deck = { state: 'spotted', until: 0, pkg: pkg, strike: null, after: null, task: 'Strike ready' };
      }
    },

    /** Applies one order now; says whether it was accepted and why not. */
    order: function (state, o) {
      if (state.over) return no('The battle is over.');
      const C = state.carriers;
      switch (o.type) {
        case 'spot': {
          const c = C[o.carrier];
          if (!c || c.side !== 'J') return no('No such carrier.');
          return MD.Deck.spot(state, c);
        }
        case 'strikeDown': {
          const c = C[o.carrier];
          if (!c || c.side !== 'J') return no('No such carrier.');
          return MD.Deck.strikeDown(state, c, null);
        }
        case 'rearm': {
          const c = C[o.carrier];
          if (!c || c.side !== 'J') return no('No such carrier.');
          return MD.Deck.rearm(state, c, o.to);
        }
        case 'launch': {
          const list = (o.carriers || []).map(function (id) { return C[id]; }).filter(function (c) { return c && c.side === 'J'; });
          if (list.length === 0) return no('Select a carrier with a strike on deck.');
          return MD.Deck.launch(state, list, { x: o.x, y: o.y });
        }
        case 'cap': {
          const c = C[o.carrier];
          if (!c || c.side !== 'J') return no('No such carrier.');
          if (!MD.Forces.fighting(c)) return no(MD.Deck.label(c) + ' is out of action.');
          return MD.Deck.setCap(state, c, o.n);
        }
        case 'scout':
          return MD.Scouting.order(state, MD.Geo.norm360(o.bearing), o.range || 300, o.prefer);
        case 'course': {
          const g = state.groups.KB;
          if (typeof o.x === 'number') {
            g.waypoint = { x: o.x, y: o.y };
            return ok('Kido Butai steering for ' + MD.Geo.fix(g.waypoint) + '.');
          }
          g.waypoint = null;
          g.orderCourse = MD.Geo.norm360(o.heading);
          return ok('Kido Butai coming to course ' + Math.round(g.orderCourse) + '°.');
        }
        case 'speed': {
          const g = state.groups.KB;
          g.orderSpeed = Math.max(0, Math.min(30, o.kt));
          return ok('Kido Butai speed ' + g.orderSpeed + ' kt.');
        }
        default:
          return no('Unknown order.');
      }
    },

    /** One minute of battle. `orders` (optional) are applied first; returns the state. */
    step: function (state, orders) {
      if (state.over) return state;
      if (orders) for (let i = 0; i < orders.length; i++) Sim.order(state, orders[i]);
      state.t += 1;
      MD.Forces.moveGroups(state);
      MD.Deck.tick(state);
      MD.Air.tick(state);
      MD.Scouting.watch(state);
      MD.Scouting.deliver(state);
      MD.UsAI.tick(state);
      MD.Damage.tick(state);
      Sim.checkEnd(state);
      return state;
    },

    /** Carrier fates for the scoreboard: lost (fatal or sunk), damaged (hit but fighting), intact. */
    tally: function (state, side) {
      const list = MD.Forces.sideCarriers(state, side);
      let lost = 0;
      let damaged = 0;
      for (let i = 0; i < list.length; i++) {
        if (!MD.Forces.fighting(list[i])) lost++;
        else if (list[i].hits > 0) damaged++;
      }
      return { lost: lost, damaged: damaged, total: list.length };
    },

    /** Points: 12 per carrier put out of action, 4 per carrier damaged, 6 for Midway in ruins, -1 per 10 planes lost. */
    score: function (state) {
      const S = MD.Data.score;
      const usCarriers = Sim.tally(state, 'A');
      const ourCarriers = Sim.tally(state, 'J');
      const ruined = state.midway.hp <= 0;
      const jPlanes = Math.floor(state.losses.J.planes / S.planesPerPoint);
      const aPlanes = Math.floor(state.losses.A.planes / S.planesPerPoint);
      // Aircraft losses take points away but never below zero.
      const J = Math.max(0, usCarriers.lost * S.carrierLost + usCarriers.damaged * S.carrierDamaged + (ruined ? S.midwayRuined : 0) - jPlanes);
      const A = Math.max(0, ourCarriers.lost * S.carrierLost + ourCarriers.damaged * S.carrierDamaged - aPlanes);
      return {
        J: J,
        A: A,
        usCarriers: usCarriers,
        ourCarriers: ourCarriers,
        midwayRuined: ruined,
        jPlanePenalty: jPlanes,
        aPlanePenalty: aPlanes,
      };
    },

    checkEnd: function (state) {
      const us = Sim.tally(state, 'A');
      const ours = Sim.tally(state, 'J');
      let result = null;
      let reason = '';
      if (us.lost === us.total) {
        result = 'victory';
        reason = 'All three American carriers are out of action.';
      } else if (ours.lost === ours.total) {
        result = 'defeat';
        reason = 'All four carriers of Kido Butai are lost.';
      } else if (state.t >= MD.Data.END_MINUTE) {
        const s = Sim.score(state);
        result = s.J > s.A ? 'victory' : s.J < s.A ? 'defeat' : 'draw';
        reason = 'Sunset. Points ' + s.J + ' to ' + s.A + '.';
      }
      if (result) {
        state.over = true;
        state.result = result;
        state.endReason = reason;
        MD.Events.emit(state, 'end', 'both', reason, { result: result, pause: true });
      }
    },

    /** Runs a whole battle with the autopilot playing Japan: for tests, the attract mode and the screenshots. */
    autoplay: function (opts, until) {
      const state = Sim.create(opts);
      const mem = MD.Autopilot.create(opts.style);
      const stop = typeof until === 'function' ? until : function () { return false; };
      while (!state.over && !stop(state)) {
        Sim.step(state, MD.Autopilot.orders(state, mem));
      }
      state.autopilot = mem;
      return state;
    },
  };

  MD.Sim = Sim;
})(globalThis.MD = globalThis.MD || {});
