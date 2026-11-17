// Hits on carriers.
//   p(fatal) = base + (armed aircraft on deck or ordnance in the hangar ? 0.55 : 0) + 0.25 x (hits - 1)
//   base: 0.10 for Japanese carriers, 0.04 for American ones (better damage control); two torpedoes are fatal.
// ok -> damaged (deck out of use for a while) -> fatal (ablaze, out of action, sinks hours later) -> sunk.
(function (MD) {
  'use strict';

  const Damage = {
    hit: function (state, c, kind, landBomb, key) {
      const D = MD.Data.damage;
      const R = MD.Rng;
      c.hits += 1;
      if (kind === 'torp') c.torpHits += 1;
      if (c.status === 'fatal' || c.status === 'sunk') return;
      const exposed = MD.Deck.exposed(c);
      let p = (c.side === 'J' ? D.baseJ : D.baseA) + (exposed ? D.exposed : 0) + (c.side === 'J' ? D.perHit : D.perHitA) * (c.hits - 1);
      if (landBomb) p *= D.landBombFactor;
      const fatal = c.torpHits >= 2 || R.chance(state, key + ':fatal', p);
      if (fatal) {
        Damage.makeFatal(state, c, exposed);
        return;
      }
      const wasOk = c.status === 'ok';
      c.status = 'damaged';
      const out = R.int(state, key + ':out', D.deckOutMin, D.deckOutMax);
      c.deckOutUntil = Math.max(c.deckOutUntil, state.t + out);
      // Aircraft caught on deck burn even when the ship survives.
      if (c.deck.pkg && (c.deck.state === 'spotting' || c.deck.state === 'spotted' || c.deck.state === 'launching')) {
        const pkg = c.deck.pkg;
        for (const role of ['D', 'T', 'F']) {
          const k = Math.ceil(pkg[role] / 2);
          pkg[role] -= k;
          MD.Air.recordLoss(state, c.side, c.types[role], k);
        }
      }
      if (c.deck.state === 'spotting' || c.deck.state === 'launching' || c.deck.state === 'unspotting') c.deck.until = Math.max(c.deck.until, c.deckOutUntil);
      // The attack's own summary reports the damage; only a ship's loss gets a signal of its own.
      void wasOk;
    },

    makeFatal: function (state, c, exposed) {
      const D = MD.Data.damage;
      c.status = 'fatal';
      c.fatalAt = state.t;
      c.detached = true;
      c.sinkAt = state.t + MD.Rng.int(state, 'sink:' + c.id, D.sinkMin, D.sinkMax);
      // Everything aboard is lost: hangar, deck and the planes being recovered.
      let lost = 0;
      for (const role of ['F', 'D', 'T']) {
        const n = c.hangar[role] + (c.deck.pkg ? c.deck.pkg[role] : 0) + (c.recovering ? c.recovering[role] : 0);
        lost += n;
        MD.Air.recordLoss(state, c.side, c.types[role], n);
        c.hangar[role] = 0;
      }
      if (c.deck.strike) {
        const f = MD.Air.find(state, c.deck.strike);
        if (f) f.waiting = f.waiting.filter(function (id) { return id !== c.id; });
        if (f && f.waiting.length === 0 && f.elements.length > 0) MD.Air.depart(state, f);
        else if (f && f.waiting.length === 0) f.phase = 'gone';
      }
      c.deck = { state: 'wrecked', until: state.t, pkg: null, strike: null, after: null, task: 'Ablaze' };
      c.recovering = null;
      c.rearm = null;
      // Fighters on patrol land on a sister ship if one still has a deck.
      const alt = MD.Air.rehome(state, c.side, c.group);
      if (alt) alt.cap.up += c.cap.up;
      else MD.Air.recordLoss(state, c.side, c.types.F, c.cap.up);
      c.cap.up = 0;
      c.cap.target = 0;
      MD.Events.emit(state, 'damage', 'both', MD.Deck.label(c) + ' is ablaze from end to end' + (exposed ? ' — fuelled and armed aircraft exploded on her deck' : '') + '. Out of action; ' + lost + ' aircraft lost with her.', {
        carrier: c.id, x: c.x, y: c.y, level: 'fatal', urgent: true, pause: true,
      });
    },

    /** Burning ships sink in their own time. */
    tick: function (state) {
      for (let i = 0; i < state.carrierOrder.length; i++) {
        const c = state.carriers[state.carrierOrder[i]];
        if (c.status === 'damaged' && state.t >= c.deckOutUntil && c.side === 'A' && c.hits <= 1 && MD.Rng.chance(state, 'repair:' + c.id + ':' + state.t, 0.02)) {
          // American damage control could patch a single bomb hit well enough to fight on.
          c.status = 'ok';
          MD.Events.emit(state, 'info', 'A', MD.Deck.label(c) + ': damage repaired, back at full speed.', { carrier: c.id });
        }
        if (c.status === 'fatal' && state.t >= c.sinkAt) {
          c.status = 'sunk';
          MD.Events.emit(state, 'sunk', 'both', MD.Deck.label(c) + ' has sunk at ' + MD.Geo.fix(c) + '.', { carrier: c.id, x: c.x, y: c.y });
        }
      }
    },
  };

  MD.Damage = Damage;
})(globalThis.MD = globalThis.MD || {});
