// A Japanese admiral for the machine: plays the player's side through the same orders the player gives, for the
// batch balance tests, the title screen's attract mode and the screenshot scenes.
//   'historical'  Nagumo's day: Midway first, a second strike readied with land bombs, rearm on the sighting,
//                 recover before launching, then one big coordinated strike.
//   'aggressive'  a sharp player: torpedoes ready from the start, a wider search, strike the moment a report lands.
(function (MD) {
  'use strict';

  const DAWN_LINES = [31, 54, 77, 100, 123, 158, 181];

  function freshest(state) {
    const intel = state.intel.J;
    let best = null;
    for (let i = 0; i < intel.length; i++) {
      const r = intel[i];
      if (r.t > state.t || r.kind === 'wrecks') continue;
      if (!best || (r.kind === 'carriers' && best.kind !== 'carriers' && r.obsT >= best.obsT - 45) || r.obsT > best.obsT) best = r;
    }
    return best;
  }

  function project(r, t) {
    return MD.Geo.advance(r, r.course, r.speed, Math.max(0, t - r.obsT));
  }

  const Autopilot = {
    create: function (style) {
      return { style: style || 'historical', firstContactAt: -1, carrierContactAt: -1, secondWave: false, rearmOrdered: false, raidSeen: false, lastSearchAt: 0, struckAt: -999 };
    },

    /** The orders this admiral gives at the current minute. */
    orders: function (state, mem) {
      const out = [];
      const t = state.t;
      const aggressive = mem.style === 'aggressive';
      const J = MD.Forces.sideCarriers(state, 'J');
      const live = J.filter(MD.Forces.fighting);
      if (t === 0) {
        out.push({ type: 'launch', carriers: ['hiryu', 'soryu'], x: 0, y: 0 });
        const lines = aggressive ? [20, 40, 60, 80, 100, 120, 140] : DAWN_LINES;
        for (let i = 0; i < lines.length; i++) out.push({ type: 'scout', bearing: lines[i], range: 300 });
        if (aggressive) {
          out.push({ type: 'scout', bearing: 70, range: 290, prefer: 'D4Y' });
          out.push({ type: 'rearm', carrier: 'akagi', to: 'ship' });
          out.push({ type: 'rearm', carrier: 'kaga', to: 'ship' });
        }
        return out;
      }
      const r = freshest(state);
      if (r && mem.firstContactAt < 0) mem.firstContactAt = t;
      if (r && r.kind === 'carriers' && mem.carrierContactAt < 0) mem.carrierContactAt = t;
      const knowsCarriers = mem.carrierContactAt >= 0 || (r && t - mem.firstContactAt > 30);

      // Raids: thicken the CAP once the enemy has found us.
      if (!mem.raidSeen && state.log.some(function (e) { return e.kind === 'raid'; })) {
        mem.raidSeen = true;
        for (let i = 0; i < live.length; i++) out.push({ type: 'cap', carrier: live[i].id, n: 9 });
      }

      if (!knowsCarriers) {
        // Second strike on Midway: spot Akagi and Kaga with land bombs and send it when ready.
        if (!aggressive && !mem.secondWave && t >= 140) {
          mem.secondWave = true;
          out.push({ type: 'spot', carrier: 'akagi' });
          out.push({ type: 'spot', carrier: 'kaga' });
        }
        const ready = live.filter(function (c) { return c.deck.state === 'spotted' && c.deck.pkg.armD === 'land'; });
        if (ready.length >= 2 && t >= 200) out.push({ type: 'launch', carriers: ready.map(function (c) { return c.id; }), x: 0, y: 0 });
      } else {
        // Enemy carriers about: everything to ship ordnance, then one coordinated strike.
        for (let i = 0; i < live.length; i++) {
          const c = live[i];
          const landNow = c.arm.D === 'land' || c.arm.T === 'land';
          if (landNow && !c.rearm && c.deck.state !== 'launching' && c.deck.state !== 'unspotting') out.push({ type: 'rearm', carrier: c.id, to: 'ship' });
        }
        if (r) {
          const kb = state.groups.KB;
          const aim = project(r, t + 70);
          const d = MD.Geo.dist(kb, aim);
          if (d > 140) out.push({ type: 'course', x: aim.x, y: aim.y });
          else out.push({ type: 'course', heading: MD.Geo.bearing(kb, aim) + 90 });
          out.push({ type: 'speed', kt: d > 180 ? 28 : 24 });
          const holding = state.flights.some(function (f) { return f.side === 'J' && f.phase === 'holding'; });
          for (let i = 0; i < live.length; i++) {
            const c = live[i];
            if (c.deck.state === 'idle' && !c.rearm && c.arm.D === 'ship' && !(holding && !aggressive) && c.hangar.D + c.hangar.T >= 6) out.push({ type: 'spot', carrier: c.id });
          }
          const spotted = live.filter(function (c) { return c.deck.state === 'spotted' && c.deck.pkg.armD === 'ship'; });
          const spotting = live.filter(function (c) { return c.deck.state === 'spotting'; });
          const enough = aggressive ? spotted.length >= 1 && spotting.length === 0 : spotted.length >= Math.min(3, live.length) || (spotted.length >= 1 && t - mem.carrierContactAt > 150);
          const flightTime = (MD.Geo.dist(kb, project(r, t)) / 125) * 60;
          const target = project(r, t + flightTime);
          if (enough && MD.Geo.dist(kb, target) <= 225 && t - mem.struckAt > 20) {
            out.push({ type: 'launch', carriers: spotted.map(function (c) { return c.id; }), x: target.x, y: target.y });
            mem.struckAt = t;
          }
        }
      }

      // Keep searching when the trail is cold.
      const cold = !r || t - r.obsT > 100;
      if (cold && t - mem.lastSearchAt > 90 && t > 120) {
        mem.lastSearchAt = t;
        const centre = r ? MD.Geo.bearing(state.groups.KB, project(r, t)) : 70;
        for (let i = -1; i <= 1; i++) out.push({ type: 'scout', bearing: centre + i * 25, range: 260 });
      }
      return out;
    },
  };

  MD.Autopilot = Autopilot;
})(globalThis.MD = globalThis.MD || {});
