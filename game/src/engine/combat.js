// What happens when a strike reaches its target: the combat air patrol meets it, escorts fight the CAP,
// anti-aircraft fire takes its share, then bombs and torpedoes fall.
//   effective = max(0, CAP strength x coordination - 0.8 x escort effectiveness)
//   shot down ~ Binomial(attackers, min(0.8, 0.45 x effective / attackers))
// Low torpedo attacks drag a radar-less CAP down to the waves: for 30 minutes afterwards its coordination
// against dive bombers is x0.3. That is how five minutes can decide a battle.
(function (MD) {
  'use strict';

  function A() {
    return MD.Data.aircraft;
  }

  /** Spread `n` CAP losses over the carriers whose fighters are up. */
  function takeCapLosses(state, carriers, n, side) {
    let left = n;
    let guard = 0;
    while (left > 0 && guard < 200) {
      guard++;
      let any = false;
      for (let i = 0; i < carriers.length && left > 0; i++) {
        const c = carriers[i];
        if (c.cap.up > 0) {
          c.cap.up -= 1;
          left -= 1;
          any = true;
          MD.Air.recordLoss(state, side, c.types.F, 1);
        }
      }
      if (!any) break;
    }
  }

  /**
   * The air battle over a target: returns what the defenders' fighters and guns did to the strike.
   * capN fighters of capType defend with coordination `coord`; `drawn` lowers it against dive bombers.
   */
  function airBattle(state, f, key, capN, capType, coord, drawn, aa) {
    const C = MD.Data.combat;
    const types = A();
    const attackers = f.elements.filter(function (e) { return e.role !== 'F' && e.n > 0; });
    const escorts = f.elements.filter(function (e) { return e.role === 'F' && e.n > 0; });
    let nAtt = 0;
    for (let i = 0; i < attackers.length; i++) nAtt += attackers[i].n;
    let escortDef = 0;
    let escortAtk = 0;
    let nEsc = 0;
    for (let i = 0; i < escorts.length; i++) {
      escortDef += escorts[i].n * types[escorts[i].type].def;
      escortAtk += escorts[i].n * types[escorts[i].type].atk;
      nEsc += escorts[i].n;
    }
    const out = { shotDown: 0, aaLosses: 0, escortLosses: 0, capLosses: 0, torpedoes: false };
    const capAtk = capN > 0 ? capN * types[capType].atk : 0;
    // Torpedo planes go in first and low.
    attackers.sort(function (a, b) {
      return (a.role === 'T' ? 0 : 1) - (b.role === 'T' ? 0 : 1);
    });
    let drawnNow = drawn;
    for (let i = 0; i < attackers.length; i++) {
      const e = attackers[i];
      if (e.role === 'T') out.torpedoes = true;
      let co = coord;
      if (e.role !== 'T' && drawnNow) co *= C.torpedoDistract;
      const eff = Math.max(0, capAtk * co - C.escortWeight * escortDef);
      let p = nAtt > 0 ? Math.min(C.killCap, (C.killScale * eff) / nAtt) : 0;
      if (e.type === 'B17') p *= C.b17Evasion;
      const k = MD.Rng.binomial(state, key + ':kill:' + i, e.n, p);
      e.n -= k;
      out.shotDown += k;
      MD.Air.recordLoss(state, f.side, e.type, k);
      if (e.role === 'T' && drawn !== null) drawnNow = true;
      const g = MD.Rng.binomial(state, key + ':aa:' + i, e.n, aa);
      e.n -= g;
      out.aaLosses += g;
      MD.Air.recordLoss(state, f.side, e.type, g);
    }
    if (capN > 0 && nEsc > 0) {
      const pE = Math.min(0.45, (0.22 * capAtk * coord) / (capAtk * coord + escortDef + 1));
      for (let i = 0; i < escorts.length; i++) {
        const k = MD.Rng.binomial(state, key + ':esc:' + i, escorts[i].n, pE);
        escorts[i].n -= k;
        out.escortLosses += k;
        MD.Air.recordLoss(state, f.side, escorts[i].type, k);
      }
    }
    if (capN > 0) {
      const pC = Math.min(0.4, (0.18 * escortAtk) / (capN * types[capType].def + escortAtk + 1) + 0.02);
      out.capLosses = MD.Rng.binomial(state, key + ':cap', capN, pC);
    }
    return out;
  }

  /** Bombs and torpedoes against the carriers of a group: returns per-carrier hit tallies. */
  function bombCarriers(state, f, g, key) {
    const types = A();
    let targets = MD.Forces.liveCarriers(state, g.id);
    if (targets.length === 0) targets = MD.Forces.carriersOf(state, g.id).filter(function (c) { return c.status !== 'sunk'; });
    const tally = {};
    let drops = 0;
    if (targets.length === 0) return { tally: tally, drops: 0 };
    // Undamaged ships draw the attack first; each squadron picks one ship.
    targets.sort(function (a, b) { return a.hits - b.hits; });
    const pilot = (f.homeGroup === 'midway' ? 0.9 : 1) * (g.side === 'A' ? MD.Data.combat.evadeA : 1);
    let elementIndex = 0;
    for (let i = 0; i < f.elements.length; i++) {
      const e = f.elements[i];
      if (e.role === 'F' || e.n <= 0) continue;
      const ac = types[e.type];
      let hitP = ac.hit * pilot;
      let kind = 'bomb';
      let land = false;
      if (e.role === 'D' && e.arm === 'land') {
        hitP *= 0.8;
        land = true;
      }
      if (e.role === 'T') {
        if (e.arm === 'land') {
          hitP *= 0.4; // level bombing a twisting ship rarely hits
          land = true;
        } else kind = 'torp';
      }
      const pickRoll = MD.Rng.u(state, key + ':pick:' + i);
      const target = targets[(elementIndex + Math.floor(pickRoll * Math.min(2, targets.length))) % targets.length];
      elementIndex += 1;
      const dropped = MD.Rng.binomial(state, key + ':drop:' + i, e.n, ac.drop);
      const hits = MD.Rng.binomial(state, key + ':hit:' + i, dropped, hitP);
      drops += dropped;
      if (!tally[target.id]) tally[target.id] = { bombs: 0, torps: 0, before: target.status };
      for (let h = 0; h < hits; h++) {
        MD.Damage.hit(state, target, kind, land, key + ':dmg:' + i + ':' + h);
        if (kind === 'torp') tally[target.id].torps += 1;
        else tally[target.id].bombs += 1;
      }
    }
    return { tally: tally, drops: drops };
  }

  function summarise(state, tally) {
    const parts = [];
    for (const id in tally) {
      const c = state.carriers[id];
      const t = tally[id];
      const hits = [];
      if (t.bombs) hits.push(t.bombs + ' bomb hit' + (t.bombs > 1 ? 's' : ''));
      if (t.torps) hits.push(t.torps + ' torpedo hit' + (t.torps > 1 ? 's' : ''));
      if (hits.length === 0) continue;
      const fate = c.status === 'fatal' ? ' — ablaze, out of action' : c.status === 'damaged' ? ' — damaged' : '';
      parts.push(MD.Deck.label(c) + ': ' + hits.join(', ') + fate);
    }
    return parts;
  }

  const Combat = {
    /** A strike reaches an enemy task group. */
    resolveStrike: function (state, f, g) {
      const C = MD.Data.combat;
      const key = 'strike:' + f.id + ':' + state.t;
      const defenders = MD.Forces.carriersOf(state, g.id).filter(function (c) { return c.status !== 'sunk'; });
      const capCarriers = defenders.filter(function (c) { return c.cap.up > 0; });
      let capN = 0;
      for (let i = 0; i < capCarriers.length; i++) capN += capCarriers[i].cap.up;
      const capType = MD.Data.carrierTypes[g.side].F;
      let coord = g.side === 'J' ? C.capCoordJ : C.capCoordA;
      if (g.capTiredUntil > state.t) coord *= 0.6;
      if (g.side === 'J' && state.diff.jCap) coord *= state.diff.jCap;
      const drawn = g.side === 'J' ? g.capDrawnUntil > state.t : null;
      const aa = g.side === 'J' ? C.aaJ : C.aaA;
      const before = MD.Air.count(f);
      const battle = airBattle(state, f, key, capN, capType, coord, drawn, aa);
      takeCapLosses(state, capCarriers, battle.capLosses, g.side);
      if (g.side === 'J' && battle.torpedoes) g.capDrawnUntil = state.t + C.torpedoDistractMinutes;
      g.capTiredUntil = state.t + 15;
      const bombs = bombCarriers(state, f, g, key);
      g.lastAttacked = state.t;
      g.lastAttackFrom = { x: f.origin.x, y: f.origin.y };
      MD.Deck.disrupt(state, g.id, 6);
      // Radar follows the raiders home: the Americans learn roughly where they came from.
      if (g.side === 'A') MD.Scouting.radarFix(state, 'A', state.groups.KB, key + ':fix', 15);
      const parts = summarise(state, bombs.tally);
      const lost = battle.shotDown + battle.aaLosses + battle.escortLosses;
      const headline = f.side === 'J'
        ? f.name + ' attacks ' + g.name + '!'
        : 'AIR ATTACK on ' + g.name + ' by ' + before + ' enemy aircraft!';
      const body = (parts.length ? parts.join('. ') + '.' : 'No hits.') +
        ' Attackers lost ' + lost + ' of ' + before + '; defending fighters lost ' + battle.capLosses + '.';
      f.result = parts.length ? 'hits' : 'miss';
      MD.Events.emit(state, 'airbattle', 'both', '', {
        x: g.x, y: g.y, attacker: f.side, cap: capN, shotDown: battle.shotDown + battle.escortLosses, capLosses: battle.capLosses, group: g.id,
      });
      MD.Events.emit(state, 'bombing', 'both', headline + ' ' + body, {
        x: g.x, y: g.y, attacker: f.side, group: g.id, tally: bombs.tally, flight: f.id, pause: true, urgent: g.side === 'J' || parts.length > 0,
        lost: lost, sent: before,
      });
    },

    /** A strike reaches Midway's airfield: its fighters and guns, then bombs on the runways and hangars. */
    resolveMidway: function (state, f) {
      const C = MD.Data.combat;
      const m = state.midway;
      const key = 'midway:' + f.id + ':' + state.t;
      const before = MD.Air.count(f);
      let capN = 0;
      let capType = 'F2A';
      if (m.hp > 0) {
        capN = (m.fighters.F2A || 0) + (m.fighters.F4F || 0);
        capType = (m.fighters.F2A || 0) >= (m.fighters.F4F || 0) ? 'F2A' : 'F4F';
      }
      const battle = airBattle(state, f, key, capN, capType, C.capCoordA, null, MD.Data.midway.aa);
      // Midway's fighters were cut to pieces by the escorts.
      let lossLeft = battle.capLosses;
      for (const t of ['F2A', 'F4F']) {
        const k = Math.min(lossLeft, m.fighters[t] || 0);
        m.fighters[t] -= k;
        lossLeft -= k;
        MD.Air.recordLoss(state, 'A', t, k);
      }
      const types = A();
      let damage = 0;
      for (let i = 0; i < f.elements.length; i++) {
        const e = f.elements[i];
        if (e.role === 'F' || e.n <= 0) continue;
        const dropped = MD.Rng.binomial(state, key + ':drop:' + i, e.n, types[e.type].drop);
        damage += dropped * (e.arm === 'land' ? MD.Data.damage.midwayLand : MD.Data.damage.midwayShip);
      }
      const wasUp = m.hp > 0;
      m.hp = Math.max(0, m.hp - damage);
      if (wasUp && m.hp <= 0) m.ruinedAt = state.t;
      MD.Scouting.radarFix(state, 'A', state.groups.KB, key + ':fix', 12);
      const lost = battle.shotDown + battle.aaLosses + battle.escortLosses;
      const verdict = m.hp <= 0
        ? 'Midway airfield is in ruins.'
        : m.hp < 45 ? 'Heavy damage. Airfield at ' + Math.round(m.hp) + '%.' : 'Airfield still operational (' + Math.round(m.hp) + '%). A second strike is needed.';
      f.result = 'midway';
      MD.Events.emit(state, 'airbattle', 'both', '', { x: 0, y: 0, attacker: f.side, cap: capN, shotDown: battle.shotDown + battle.escortLosses, capLosses: battle.capLosses, group: 'midway' });
      MD.Events.emit(state, 'midway', 'J', f.name + ' over Midway: ' + verdict + ' We lost ' + lost + ' of ' + before + '; ' + battle.capLosses + ' defending fighters shot down.', {
        x: 0, y: 0, hp: m.hp, flight: f.id, pause: true, damage: damage,
      });
    },
  };

  MD.Combat = Combat;
})(globalThis.MD = globalThis.MD || {});
