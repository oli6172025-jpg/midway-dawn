// The flight deck: the heart of the game. Each carrier runs one deck state machine:
//   idle --spot (35-55 min)--> spotting --> spotted --launch (10 min)--> launching --> idle
//   spotted --strike down (15 min)--> unspotting --> idle
//   idle --(returning planes circling)--> recovering (45 min) --> idle
// Rearming (75 min) happens in the hangar beside it and blocks spotting. While bombs and fuel are out on the
// deck or in the hangar the carrier is "exposed": one bomb then is far more likely to be fatal.
(function (MD) {
  'use strict';

  const ROLE_NAMES = { F: 'fighters', D: 'dive bombers', T: 'torpedo bombers' };

  function typeOf(c, role) {
    return c.types[role];
  }

  function armWord(c, role) {
    if (role === 'D') return c.arm.D === 'land' ? 'land bombs' : 'AP bombs';
    if (role === 'T') return c.arm.T === 'land' ? 'land bombs' : 'torpedoes';
    return '';
  }

  /** "18 D3A · 18 B5N (torpedoes) · 9 A6M" */
  function describePkg(c, pkg) {
    const parts = [];
    if (pkg.D) parts.push(pkg.D + ' ' + typeOf(c, 'D') + ' (' + armWord(c, 'D') + ')');
    if (pkg.T) parts.push(pkg.T + ' ' + typeOf(c, 'T') + ' (' + armWord(c, 'T') + ')');
    if (pkg.F) parts.push(pkg.F + ' ' + typeOf(c, 'F'));
    return parts.join(' · ');
  }

  function label(c) {
    return c.kanji ? c.name + ' ' + c.kanji : c.name;
  }

  function ok(msg) {
    return { ok: true, msg: msg };
  }
  function no(msg) {
    return { ok: false, msg: msg };
  }

  const Deck = {
    label: label,
    describePkg: describePkg,
    armWord: armWord,

    /** Bombs, torpedoes and fuelled aircraft out on deck or being swapped in the hangar. */
    exposed: function (c) {
      const s = c.deck.state;
      return s === 'spotting' || s === 'spotted' || s === 'launching' || s === 'unspotting' || c.rearm !== null;
    },

    busy: function (c) {
      return c.deck.state !== 'idle';
    },

    /** Minutes left on the deck's current task (0 when idle or waiting). */
    minutesLeft: function (state, c) {
      if (c.deck.state === 'spotted' || c.deck.state === 'idle') return 0;
      return Math.max(0, Math.ceil(c.deck.until - state.t));
    },

    /** The strike the next spot would range: every bomber in the hangar, with an escort of fighters. */
    packageFor: function (c) {
      return {
        D: Math.max(0, c.hangar.D - c.reserveD),
        T: c.hangar.T,
        F: Math.min(c.escortSize, c.hangar.F),
      };
    },

    spot: function (state, c) {
      if (!MD.Forces.fighting(c)) return no(label(c) + ' is out of action.');
      if (state.t < c.deckOutUntil) return no(label(c) + ': flight deck wrecked, repairs until ' + MD.Geo.clock(c.deckOutUntil) + '.');
      if (c.deck.state !== 'idle') return no(label(c) + ': deck busy (' + c.deck.state + ').');
      if (c.rearm) return no(label(c) + ': still rearming until ' + MD.Geo.clock(c.rearm.until) + '.');
      const pkg = Deck.packageFor(c);
      if (pkg.D + pkg.T === 0) return no(label(c) + ': no bombers in the hangar to spot.');
      c.hangar.D -= pkg.D;
      c.hangar.T -= pkg.T;
      c.hangar.F -= pkg.F;
      pkg.armD = c.arm.D;
      pkg.armT = c.arm.T;
      const R = MD.Rng;
      const key = 'spot:' + c.id + ':' + state.t;
      let minutes = R.int(state, key, MD.Data.deck.spotMin, MD.Data.deck.spotMax);
      let fault = 0;
      if (R.chance(state, key + ':fault', MD.Data.deck.faultChance)) {
        fault = R.int(state, key + ':faultmin', MD.Data.deck.faultMin, MD.Data.deck.faultMax);
        minutes += fault;
      }
      c.deck = { state: 'spotting', until: state.t + minutes, pkg: pkg, strike: null, after: null, task: 'Spotting strike' };
      if (fault > 0 && c.side === 'J') MD.Events.emit(state, 'deck', 'J', label(c) + ': elevator fault — spotting delayed ' + fault + ' min.', { carrier: c.id });
      return ok(label(c) + ': spotting ' + describePkg(c, pkg) + ' — ready ' + MD.Geo.clock(state.t + minutes) + '.');
    },

    /** Sends a spotted strike back down to the hangar so the deck can take returning planes. */
    strikeDown: function (state, c, after) {
      if (c.deck.state !== 'spotted' && c.deck.state !== 'spotting') return no(label(c) + ': nothing spotted on deck.');
      c.deck.state = 'unspotting';
      c.deck.until = state.t + MD.Data.deck.strikeDown;
      c.deck.task = 'Striking down';
      c.deck.after = after || null;
      return ok(label(c) + ': striking the deck down — clear at ' + MD.Geo.clock(c.deck.until) + '.');
    },

    /** Swap ordnance: 'ship' (AP bombs and torpedoes) or 'land' (land bombs for Midway). */
    rearm: function (state, c, to) {
      if (!MD.Forces.fighting(c)) return no(label(c) + ' is out of action.');
      if (to !== 'ship' && to !== 'land') return no('Unknown ordnance.');
      if (c.rearm && c.rearm.to === to) return no(label(c) + ': already rearming.');
      if (c.arm.D === to && c.arm.T === to && !c.rearm) return no(label(c) + ': already armed with ' + (to === 'ship' ? 'AP bombs and torpedoes' : 'land bombs') + '.');
      if (c.deck.state === 'spotted' || c.deck.state === 'spotting') {
        Deck.strikeDown(state, c, { kind: 'rearm', to: to });
        return ok(label(c) + ': striking down to rearm with ' + (to === 'ship' ? 'torpedoes / AP bombs' : 'land bombs') + '.');
      }
      if (c.deck.state === 'launching' || c.deck.state === 'unspotting') return no(label(c) + ': deck busy, try after ' + MD.Geo.clock(c.deck.until) + '.');
      return Deck.startRearm(state, c, to);
    },

    startRearm: function (state, c, to) {
      if (c.hangar.D + c.hangar.T === 0) {
        c.arm.D = to;
        c.arm.T = to;
        c.rearm = null;
        return ok(label(c) + ': hangar empty — returning planes will be armed with ' + (to === 'ship' ? 'torpedoes / AP bombs' : 'land bombs') + '.');
      }
      c.rearm = { until: state.t + MD.Data.deck.rearm, to: to };
      return ok(label(c) + ': rearming with ' + (to === 'ship' ? 'torpedoes / AP bombs' : 'land bombs') + ' — done ' + MD.Geo.clock(c.rearm.until) + '.');
    },

    /** The farthest a package can fly with its ordnance, and the type that limits it. */
    rangeOf: function (c, pkg) {
      const A = MD.Data.aircraft;
      let best = Infinity;
      let limiter = '';
      const check = function (role, n, arm) {
        if (!n) return;
        const t = A[typeOf(c, role)];
        const r = role === 'T' && arm === 'ship' ? t.radiusTorp : t.radius;
        if (r < best) {
          best = r;
          limiter = t.name.split(' ')[0] + (role === 'T' ? (arm === 'ship' ? ' torpedo' : ' bomb') : '') + ' radius ' + r + ' nm';
        }
      };
      check('D', pkg.D, pkg.armD);
      check('T', pkg.T, pkg.armT);
      check('F', pkg.F, null);
      return { radius: best, limiter: limiter };
    },

    /**
     * Launch the spotted strikes of `carriers` together at a sea point (or Midway). Refuses, saying why, when any
     * deck is not ready or the target lies beyond a type's radius. opts.dropOutOfRange (the AI's) leaves the
     * types that cannot reach behind in the hangar instead of refusing.
     */
    launch: function (state, carriers, target, opts) {
      opts = opts || {};
      if (carriers.length === 0) return no('No carrier has a strike spotted.');
      for (let i = 0; i < carriers.length; i++) {
        const c = carriers[i];
        if (!MD.Forces.fighting(c)) return no(label(c) + ' is out of action.');
        if (state.t < c.deckOutUntil) return no(label(c) + ': flight deck wrecked.');
        if (c.deck.state !== 'spotted') return no(label(c) + ': no strike spotted' + (c.deck.state === 'spotting' ? ' yet (ready ' + MD.Geo.clock(c.deck.until) + ')' : '') + '.');
      }
      const toMidway = MD.Geo.dist(target, { x: 0, y: 0 }) < 20;
      const aim = toMidway ? { x: 0, y: 0 } : { x: target.x, y: target.y };
      const A = MD.Data.aircraft;
      for (let i = 0; i < carriers.length; i++) {
        const c = carriers[i];
        const d = MD.Geo.dist(c, aim);
        const pkg = c.deck.pkg;
        const roles = ['D', 'T', 'F'];
        for (let r = 0; r < roles.length; r++) {
          const role = roles[r];
          if (!pkg[role]) continue;
          const t = A[typeOf(c, role)];
          const arm = role === 'D' ? pkg.armD : role === 'T' ? pkg.armT : null;
          const radius = role === 'T' && arm === 'ship' ? t.radiusTorp : t.radius;
          if (d > radius) {
            if (opts.dropOutOfRange) {
              c.hangar[role] += pkg[role];
              pkg[role] = 0;
            } else {
              const what = t.name.split(' ')[0] + (role === 'T' ? (arm === 'ship' ? ' torpedo' : ' bomb') : '');
              return no('Out of range: ' + what + ' radius ' + radius + ' nm, target ' + Math.round(d) + ' nm from ' + label(c) + '.');
            }
          }
        }
        if (pkg.D + pkg.T === 0) {
          if (opts.dropOutOfRange) continue;
          return no(label(c) + ': nothing left that can reach.');
        }
      }
      const launching = carriers.filter(function (c) { return c.deck.pkg.D + c.deck.pkg.T > 0; });
      if (launching.length === 0) return no('Nothing in range to launch.');
      const flight = MD.Air.formStrike(state, launching[0].side, launching, aim, toMidway ? 'midway' : 'sea', opts);
      for (let i = 0; i < launching.length; i++) {
        const c = launching[i];
        c.deck.state = 'launching';
        c.deck.until = state.t + MD.Data.deck.launch;
        c.deck.strike = flight.id;
        c.deck.task = 'Launching';
      }
      const names = launching.map(function (c) { return c.name; }).join(', ');
      return ok(flight.name + ' launching from ' + names + ' — target ' + (toMidway ? 'Midway' : MD.Geo.fix(aim)) + ', ' + Math.round(MD.Geo.dist(launching[0], aim)) + ' nm.');
    },

    /** Attacks overhead make ships twist and turn: deck work in progress slips. */
    disrupt: function (state, groupId, minutes) {
      const list = MD.Forces.carriersOf(state, groupId);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const s = c.deck.state;
        if (s === 'spotting' || s === 'launching' || s === 'recovering' || s === 'unspotting') c.deck.until += minutes;
        if (c.rearm) c.rearm.until += Math.round(minutes / 2);
      }
    },

    /** One minute of deck work on every carrier. */
    tick: function (state) {
      for (let i = 0; i < state.carrierOrder.length; i++) {
        const c = state.carriers[state.carrierOrder[i]];
        if (!MD.Forces.fighting(c)) continue;
        Deck.tickCarrier(state, c);
      }
    },

    tickCarrier: function (state, c) {
      const t = state.t;
      const d = c.deck;
      if (c.rearm && t >= c.rearm.until) {
        c.arm.D = c.rearm.to;
        c.arm.T = c.rearm.to;
        MD.Events.emit(state, 'deck', c.side, label(c) + ': rearmed with ' + (c.rearm.to === 'ship' ? 'torpedoes and AP bombs.' : 'land bombs.'), { carrier: c.id });
        c.rearm = null;
      }
      if (t < c.deckOutUntil) return;
      if (d.state === 'spotting' && t >= d.until) {
        d.state = 'spotted';
        d.task = 'Strike ready';
        MD.Events.emit(state, 'deck', c.side, label(c) + ': strike spotted and ready — ' + describePkg(c, d.pkg) + '.', { carrier: c.id, ready: true });
      } else if (d.state === 'launching' && t >= d.until) {
        MD.Air.joinStrike(state, c, d.strike, d.pkg);
        c.deck = { state: 'idle', until: t, pkg: null, strike: null, after: null, task: '' };
      } else if (d.state === 'unspotting' && t >= d.until) {
        const pkg = d.pkg;
        c.hangar.D += pkg.D;
        c.hangar.T += pkg.T;
        c.hangar.F += pkg.F;
        const after = d.after;
        c.deck = { state: 'idle', until: t, pkg: null, strike: null, after: null, task: '' };
        MD.Events.emit(state, 'deck', c.side, label(c) + ': deck cleared.', { carrier: c.id });
        if (after && after.kind === 'rearm') Deck.startRearm(state, c, after.to);
      } else if (d.state === 'recovering' && t >= d.until) {
        const r = c.recovering;
        c.hangar.F += r.F;
        c.hangar.D += r.D;
        c.hangar.T += r.T;
        c.recovering = null;
        c.deck = { state: 'idle', until: t, pkg: null, strike: null, after: null, task: '' };
        MD.Events.emit(state, 'deck', c.side, label(c) + ': recovery complete — ' + (r.F + r.D + r.T) + ' aircraft refuelled and rearmed.', { carrier: c.id });
      }
      if (c.deck.state === 'idle') Deck.tryRecover(state, c);
      if (t % 5 === 0) Deck.tendCap(state, c);
    },

    /** Lands every element circling for this carrier, if the deck is clear. */
    tryRecover: function (state, c) {
      const R = MD.Rng;
      let F = 0;
      let D = 0;
      let T = 0;
      let lost = 0;
      for (let i = 0; i < state.flights.length; i++) {
        const f = state.flights[i];
        if (f.phase !== 'holding' || f.side !== c.side) continue;
        for (let j = 0; j < f.elements.length; j++) {
          const e = f.elements[j];
          if (e.home !== c.id || e.n <= 0) continue;
          const crashes = R.binomial(state, 'land:' + f.id + ':' + j + ':' + state.t, e.n, MD.Data.deck.landAccident);
          const n = e.n - crashes;
          lost += crashes;
          MD.Air.recordLoss(state, c.side, e.type, crashes);
          if (e.role === 'F') F += n;
          else if (e.role === 'D') D += n;
          else T += n;
          e.n = 0;
        }
      }
      if (F + D + T + lost === 0) return;
      c.recovering = { F: F, D: D, T: T };
      c.deck = { state: 'recovering', until: state.t + MD.Data.deck.recover, pkg: null, strike: null, after: null, task: 'Recovering' };
      MD.Events.emit(state, 'deck', c.side, label(c) + ': recovering ' + (F + D + T) + ' aircraft' + (lost ? ' (' + lost + ' lost in deck crashes)' : '') + '.', { carrier: c.id });
      MD.Air.pruneFlights(state);
    },

    /** Combat air patrol: fighters go up or come down a few at a time whenever the deck is free. */
    tendCap: function (state, c) {
      const s = c.deck.state;
      if (s !== 'idle' && s !== 'recovering') return;
      const step = MD.Data.deck.capStep;
      if (c.cap.up < c.cap.target && c.hangar.F > 0) {
        const n = Math.min(step, c.cap.target - c.cap.up, c.hangar.F);
        c.hangar.F -= n;
        c.cap.up += n;
      } else if (c.cap.up > c.cap.target) {
        const n = Math.min(step, c.cap.up - c.cap.target);
        c.cap.up -= n;
        c.hangar.F += n;
      }
    },

    setCap: function (state, c, n) {
      const max = c.cap.up + c.hangar.F;
      c.cap.target = Math.max(0, Math.min(n, max, 27));
      return ok(label(c) + ': CAP set to ' + c.cap.target + ' fighters.');
    },

    roleName: function (role) {
      return ROLE_NAMES[role];
    },
  };

  MD.Deck = Deck;
})(globalThis.MD = globalThis.MD || {});
