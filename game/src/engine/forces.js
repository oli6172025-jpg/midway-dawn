// The fleets at sea: task groups that steam, carriers that keep station in them, and the questions every other
// part of the engine asks about them (which carriers still fight, where a carrier is, who is out of action).
(function (MD) {
  'use strict';

  const DEG = Math.PI / 180;

  const Forces = {
    /** Builds the three task groups and seven carriers of 04:30. */
    createFleets: function (state) {
      const D = MD.Data;
      state.groups = {};
      for (let i = 0; i < D.groups.length; i++) {
        const g = D.groups[i];
        const p = MD.Geo.polar(g.bearing, g.range);
        state.groups[g.id] = {
          id: g.id,
          side: g.side,
          name: g.name,
          kanji: g.kanji,
          x: p.x,
          y: p.y,
          course: g.course,
          speed: g.speed,
          orderCourse: g.course,
          orderSpeed: g.speed,
          waypoint: null,
          escorts: g.escorts,
          capDrawnUntil: -1,
          capTiredUntil: -1,
          lastAttacked: -999,
          lastAttackFrom: null,
          trail: [{ x: p.x, y: p.y, t: 0 }],
        };
      }
      state.carriers = {};
      state.carrierOrder = [];
      for (let i = 0; i < D.carriers.length; i++) {
        const c = D.carriers[i];
        const types = D.carrierTypes[c.side];
        state.carriers[c.id] = {
          id: c.id,
          side: c.side,
          group: c.group,
          name: c.name,
          kanji: c.kanji,
          islandPort: c.islandPort,
          length: c.length,
          slot: c.slot,
          types: types,
          x: 0,
          y: 0,
          heading: 0,
          detached: false,
          status: 'ok', // ok | damaged | fatal | sunk
          hits: 0,
          torpHits: 0,
          deckOutUntil: -1,
          sinkAt: -1,
          fatalAt: -1,
          hangar: { F: c.F - c.cap, D: c.D, T: c.T },
          arm: { D: 'ship', T: 'ship' },
          cap: { up: c.cap, target: c.cap },
          deck: { state: 'idle', until: 0, pkg: null, strike: null, after: null, task: '' },
          rearm: null,
          recovering: null,
          escortSize: c.escort || D.deck.escortPerCarrier,
          nav: c.nav || D.combat.navJ,
          reserveD: c.reserveD || 0,
        };
        state.carrierOrder.push(c.id);
      }
      Forces.keepStation(state);
    },

    carriersOf: function (state, groupId) {
      const out = [];
      for (let i = 0; i < state.carrierOrder.length; i++) {
        const c = state.carriers[state.carrierOrder[i]];
        if (c.group === groupId) out.push(c);
      }
      return out;
    },

    sideCarriers: function (state, side) {
      const out = [];
      for (let i = 0; i < state.carrierOrder.length; i++) {
        const c = state.carriers[state.carrierOrder[i]];
        if (c.side === side) out.push(c);
      }
      return out;
    },

    /** Still fighting: not burning out of control and not sunk. */
    fighting: function (c) {
      return c.status === 'ok' || c.status === 'damaged';
    },

    liveCarriers: function (state, groupId) {
      return Forces.carriersOf(state, groupId).filter(Forces.fighting);
    },

    /** Can planes take off from and land on this deck right now? */
    deckUsable: function (state, c) {
      return Forces.fighting(c) && state.t >= c.deckOutUntil;
    },

    /** Steams every group one minute toward its waypoint or along its ordered course, at its ordered speed. */
    moveGroups: function (state) {
      for (const id in state.groups) {
        const g = state.groups[id];
        const live = Forces.liveCarriers(state, id);
        if (live.length === 0) {
          g.speed = Math.max(0, g.speed - 2);
        } else {
          if (g.waypoint) {
            if (MD.Geo.dist(g, g.waypoint) < 3) {
              g.orderCourse = g.course;
              g.waypoint = null;
            } else {
              g.orderCourse = MD.Geo.bearing(g, g.waypoint);
            }
          }
          // Ships turn and accelerate gradually: 10 degrees and 2 knots a minute.
          const dTurn = MD.Geo.turn(g.course, g.orderCourse);
          g.course = MD.Geo.norm360(g.course + Math.max(-10, Math.min(10, dTurn)));
          const top = live.some(function (c) { return c.status === 'damaged'; }) ? Math.min(g.orderSpeed, 24) : g.orderSpeed;
          g.speed += Math.max(-2, Math.min(2, top - g.speed));
        }
        const p = MD.Geo.advance(g, g.course, g.speed, 1);
        const lim = MD.Data.MAP_RADIUS - 5;
        g.x = Math.max(-lim, Math.min(lim, p.x));
        g.y = Math.max(-lim, Math.min(lim, p.y));
        if (state.t % 10 === 0) g.trail.push({ x: g.x, y: g.y, t: state.t });
      }
      Forces.keepStation(state);
    },

    /** Carriers in formation sit at their slot, rotated with the group's course; a stricken one drifts. */
    keepStation: function (state) {
      for (let i = 0; i < state.carrierOrder.length; i++) {
        const c = state.carriers[state.carrierOrder[i]];
        if (c.detached) {
          // Dead in the water: the trade wind pushes the hulk slowly west-north-west.
          c.x -= 0.02;
          c.y += 0.008;
          continue;
        }
        const g = state.groups[c.group];
        const a = g.course * DEG;
        // Slot x is to starboard, y is ahead, relative to the course.
        c.x = g.x + c.slot.x * Math.cos(a) + c.slot.y * Math.sin(a);
        c.y = g.y - c.slot.x * Math.sin(a) + c.slot.y * Math.cos(a);
        c.heading = g.course;
      }
    },
  };

  MD.Forces = Forces;
})(globalThis.MD = globalThis.MD || {});
