// The battle report at sunset (or when one side's carriers are gone): the verdict, the points, each carrier's fate
// on both sides, aircraft lost, the day's turning points, and the buttons to fight again.
(function (MD) {
  'use strict';

  function fate(state, c) {
    if (c.status === 'sunk') return ['lost', 'sunk'];
    if (c.status === 'fatal') return ['lost', 'ablaze ' + MD.Geo.clock(c.fatalAt)];
    if (c.hits > 0) return ['damaged', c.hits + (c.hits > 1 ? ' hits' : ' hit')];
    return ['ok', 'intact'];
  }

  function sideTable(state, side) {
    const rows = MD.Forces.sideCarriers(state, side).map(function (c) {
      const f = fate(state, c);
      return '<tr><td>' + c.name + (c.kanji ? ' ' + c.kanji : '') + '</td><td class="fate ' + f[0] + '">' + f[1] + '</td></tr>';
    });
    rows.push('<tr><td>Aircraft lost</td><td>' + state.losses[side].planes + '</td></tr>');
    if (side === 'A') rows.push('<tr><td>Midway airfield</td><td class="fate ' + (state.midway.hp <= 0 ? 'lost' : state.midway.hp < 60 ? 'damaged' : 'ok') + '">' + (state.midway.hp <= 0 ? 'in ruins' : Math.round(state.midway.hp) + '%') + '</td></tr>');
    return '<table>' + rows.join('') + '</table>';
  }

  /** The handful of moments worth remembering, in order. */
  function moments(state) {
    const out = [];
    let sawCarrier = false;
    for (let i = 0; i < state.log.length && out.length < 10; i++) {
      const e = state.log[i];
      if (e.kind === 'report' && e.urgent && !sawCarrier) {
        sawCarrier = true;
        const rep = state.intel.J.filter(function (r) { return r.id === e.report; })[0];
        out.push([e.t, 'Enemy carriers sighted by ' + (rep ? rep.source : 'a search plane')]);
      } else if (e.kind === 'damage' && e.level === 'fatal') {
        out.push([e.t, e.text.split(' is ablaze')[0] + ' set ablaze']);
      } else if (e.kind === 'raid') {
        if (!out.some(function (m) { return m[1].indexOf('raid') >= 0 && Math.abs(m[0] - e.t) < 40; })) out.push([e.t, 'Enemy raid sighted']);
      } else if (e.kind === 'midway' && e.hp <= 0) {
        out.push([e.t, 'Midway airfield destroyed']);
      } else if (e.kind === 'flight' && e.launch && e.side === 'J') {
        out.push([e.t, e.text.split(' airborne')[0] + ' launched']);
      }
    }
    return out.map(function (m) { return '<div><b>' + MD.Geo.clock(m[0]) + '</b> ' + m[1] + '</div>'; }).join('');
  }

  const Debrief = {
    show: function (app, newBest) {
      const state = app.session.state;
      const sc = MD.Sim.score(state);
      const r = state.result;
      const title = r === 'victory' ? 'VICTORY' : r === 'defeat' ? 'DEFEAT' : 'DRAW';
      const stamp = r === 'victory' ? '勝利' : r === 'defeat' ? '敗北' : '引分';
      const dmgUs = sc.usCarriers;
      const parts = [];
      if (dmgUs.lost) parts.push(dmgUs.lost + ' US carrier' + (dmgUs.lost > 1 ? 's' : '') + ' ×12');
      if (dmgUs.damaged) parts.push(dmgUs.damaged + ' damaged ×4');
      if (sc.midwayRuined) parts.push('Midway ruined +6');
      if (sc.jPlanePenalty) parts.push('aircraft lost −' + sc.jPlanePenalty);
      const el = document.getElementById('debrief');
      el.innerHTML =
        '<div class="debrief-map-title">THE DAY REVEALED · <b>Kido Butai</b> · <i>US task forces</i></div>' +
        '<div class="report ' + r + '">' +
        '<h2>BATTLE REPORT · 戦闘詳報 · 4 JUNE 1942</h2>' +
        '<div class="verdict-stamp">' + stamp + '<small>' + title + '</small></div>' +
        '<h3>' + title + '</h3>' +
        '<div class="reason">' + state.endReason + ' ' + MD.Data.difficulty[state.difficulty].name + ' · seed ' + state.seed + ' · ' + MD.Geo.clock(state.t) + '</div>' +
        '<div class="sides"><div class="side jp"><h4>KIDO BUTAI 機動部隊</h4>' + sideTable(state, 'J') + '</div>' +
        '<div class="side us"><h4>US PACIFIC FLEET</h4>' + sideTable(state, 'A') + '</div></div>' +
        '<div class="points"><div class="pj">' + sc.J + '<small>JAPAN</small></div><div style="font-size:16px;color:#6a5a3a">—</div><div class="pa">' + sc.A + '<small>USA</small></div></div>' +
        '<div class="breakdown">' + (parts.join(' · ') || 'No enemy carrier hit') + (newBest ? ' · <b>NEW BEST MARGIN</b>' : '') + '</div>' +
        '<div class="moments">' + moments(state) + '</div>' +
        '<div class="btns"><button class="primary" data-act="again">FIGHT AGAIN</button><button data-act="new">NEW BATTLE</button><button data-act="title">TITLE</button></div>' +
        '</div>';
      el.classList.remove('hidden');
      el.onclick = function (e) {
        const act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        MD.Sound.click();
        if (act === 'again') app.startBattle(state.seed, state.difficulty);
        else if (act === 'new') app.startBattle(1 + ((state.seed * 7919 + 104729) % 999983), state.difficulty);
        else app.showTitle();
      };
    },

    hide: function () {
      document.getElementById('debrief').classList.add('hidden');
    },
  };

  MD.Debrief = Debrief;
})(globalThis.MD = globalThis.MD || {});
