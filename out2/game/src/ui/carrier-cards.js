// The fleet panel: one card per carrier showing, at a glance, what is on her flight deck, what the bombers carry,
// the job in hand with the minutes it has left, and the commands that make sense now. Below the cards, the
// fleet's course and speed, the search planes and "launch everything spotted".
(function (MD) {
  'use strict';

  const ROLE_COLOR = { F: '#f1ead6', D: '#e9c46a', T: '#9fd3a9' };
  let app = null;
  const sigs = {};

  function el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function frac(state, since, until) {
    if (since === undefined || until <= since) return 0;
    return Math.max(0, Math.min(1, (state.t - since) / (until - since)));
  }

  function chip(c) {
    if (c.status === 'fatal') return ['fatal', 'ABLAZE'];
    if (c.status === 'sunk') return ['sunk', 'SUNK'];
    if (c.status === 'damaged') return ['damaged', 'DAMAGED'];
    const s = c.deck.state;
    if (s === 'spotted') return ['ok', 'STRIKE READY'];
    if (s === 'spotting') return ['ok', 'SPOTTING'];
    if (s === 'launching') return ['ok', 'LAUNCHING'];
    if (s === 'recovering') return ['ok', 'RECOVERING'];
    if (s === 'unspotting') return ['ok', 'CLEARING'];
    if (c.rearm) return ['ok', 'REARMING'];
    return ['ok', 'DECK CLEAR'];
  }

  /** What the bar under the deck says and how full it is. */
  function task(state, c) {
    const d = c.deck;
    if (c.status === 'fatal') return { text: 'Fires out of control · sinking', f: 1, hot: true };
    if (c.status === 'sunk') return { text: 'Sunk', f: 1, hot: true };
    if (state.t < c.deckOutUntil) return { text: 'Deck wrecked · repairs ' + (c.deckOutUntil - state.t) + ' min', f: 1 - (c.deckOutUntil - state.t) / 150, hot: true };
    const rearm = c.rearm ? ' · rearm ' + (c.rearm.until - state.t) + ' min' : '';
    if (d.state === 'spotting') return { text: 'Spotting strike · ' + (d.until - state.t) + ' min' + rearm, f: frac(state, d.since, d.until) };
    if (d.state === 'launching') return { text: 'Launching · ' + (d.until - state.t) + ' min', f: frac(state, d.since, d.until) };
    if (d.state === 'recovering') return { text: 'Recovering aircraft · ' + (d.until - state.t) + ' min' + rearm, f: frac(state, d.since, d.until) };
    if (d.state === 'unspotting') return { text: 'Striking down · ' + (d.until - state.t) + ' min', f: frac(state, d.since, d.until) };
    if (d.state === 'spotted') return { text: 'Strike on deck — drag card to the chart', f: 1 };
    if (c.rearm) return { text: 'Rearming with ' + (c.rearm.to === 'ship' ? 'torpedoes / AP' : 'land bombs') + ' · ' + (c.rearm.until - state.t) + ' min', f: frac(state, c.rearm.since, c.rearm.until), hot: true };
    const waiting = state.flights.some(function (f) {
      return f.phase === 'holding' && f.side === 'J' && f.elements.some(function (e) { return e.home === c.id && e.n > 0; });
    });
    if (waiting) return { text: 'Planes circling — clear the deck to land them', f: 0, hot: true };
    return { text: 'Deck clear', f: 0 };
  }

  /** The flight deck drawn from above, with every aircraft on it. */
  function drawDeck(cv, state, c) {
    const g = cv.getContext('2d');
    const w = cv.width;
    const h = cv.height;
    g.clearRect(0, 0, w, h);
    const dead = c.status === 'fatal' || c.status === 'sunk';
    // Hull and deck, bow to the right.
    g.fillStyle = '#2a3036';
    g.beginPath();
    g.moveTo(4, h * 0.2);
    g.lineTo(w - 22, h * 0.2);
    g.quadraticCurveTo(w - 2, h * 0.5, w - 22, h * 0.8);
    g.lineTo(4, h * 0.8);
    g.closePath();
    g.fill();
    g.fillStyle = dead ? '#3a2418' : '#a8865a';
    g.fillRect(8, h * 0.14, w - 34, h * 0.72);
    g.strokeStyle = 'rgba(60, 40, 20, 0.35)';
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(8, h * 0.14 + (h * 0.72 * i) / 4);
      g.lineTo(w - 26, h * 0.14 + (h * 0.72 * i) / 4);
      g.stroke();
    }
    g.fillStyle = '#ece4d2';
    g.fillRect(w - 52, h * 0.24, 18, h * 0.52);
    g.fillStyle = '#c8402f';
    g.beginPath();
    g.arc(w - 43, h * 0.5, h * 0.18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#353b42';
    if (c.islandPort) g.fillRect(w * 0.62, h * 0.04, 14, h * 0.18);
    else g.fillRect(w * 0.62, h * 0.78, 14, h * 0.18);
    if (dead) {
      for (let i = 0; i < 9; i++) {
        g.fillStyle = 'rgba(255,' + (90 + i * 15) + ', 30, 0.75)';
        g.beginPath();
        g.arc(20 + i * 25, h * 0.5 + Math.sin(i * 2.1) * 6, 5 + (i % 3) * 2, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    // Aircraft on deck: ranged aft (left) for launch, or arriving during recovery.
    const d = c.deck;
    let roles = [];
    let shown = 1;
    if (d.pkg && (d.state === 'spotting' || d.state === 'spotted' || d.state === 'launching' || d.state === 'unspotting')) {
      roles = [['T', d.pkg.T], ['D', d.pkg.D], ['F', d.pkg.F]];
      if (d.state === 'spotting') shown = frac(state, d.since, d.until);
      if (d.state === 'launching') shown = 1 - frac(state, d.since, d.until);
      if (d.state === 'unspotting') shown = 1 - frac(state, d.since, d.until);
    } else if (d.state === 'recovering' && c.recovering) {
      roles = [['F', c.recovering.F], ['D', c.recovering.D], ['T', c.recovering.T]];
      shown = 1 - frac(state, d.since, d.until);
    }
    let col = 0;
    const per = 4;
    for (let r = 0; r < roles.length; r++) {
      const role = roles[r][0];
      const n = Math.round(roles[r][1] * shown);
      for (let k = 0; k < n; k++) {
        const x = 14 + Math.floor(col / per) * 9;
        const y = h * 0.22 + (col % per) * (h * 0.15);
        col++;
        if (x > w - 60) break;
        g.fillStyle = ROLE_COLOR[role];
        g.fillRect(x, y + 2, 7, 1.6);
        g.fillRect(x + 4, y, 1.4, 5.6);
        if (role !== 'F') {
          const arm = role === 'D' ? d.pkg && d.pkg.armD : d.pkg && d.pkg.armT;
          g.fillStyle = arm === 'land' ? '#d38a3a' : '#5aa0d8';
          g.fillRect(x + 1, y + 4, 2, 2);
        }
      }
    }
    if (c.rearm) {
      // Ordnance carts in the hangar: the exposure that makes a hit fatal.
      for (let i = 0; i < 6; i++) {
        g.fillStyle = c.rearm.to === 'ship' ? '#5aa0d8' : '#d38a3a';
        g.fillRect(w * 0.45 + i * 9, h * 0.8, 6, 3);
      }
    }
  }

  function cardHtml(c) {
    return (
      '<div class="card" data-carrier="' + c.id + '">' +
      '<div class="card-head"><span class="card-name">' + c.name + '<span class="kanji">' + c.kanji + '</span></span><span class="chip"></span></div>' +
      '<canvas class="deck" width="276" height="34"></canvas>' +
      '<div class="task"><i></i><span></span></div>' +
      '<div class="card-row hangar"></div>' +
      '<div class="card-btns">' +
      '<button class="cbtn" data-act="spot" title="Bring the bombers up and range them on deck (S)">SPOT</button>' +
      '<button class="cbtn go" data-act="launch" title="Launch the spotted strike (drag the card to the chart)">LAUNCH ▸</button>' +
      '<button class="cbtn" data-act="rearm" title="Change bombs and torpedoes (R)">REARM</button>' +
      '<button class="cbtn" data-act="clear" title="Strike the spotted planes below to clear the deck">CLEAR</button>' +
      '</div></div>'
    );
  }

  const Cards = {
    build: function (theApp) {
      app = theApp;
      const box = document.getElementById('cards');
      box.innerHTML = '';
      for (const k in sigs) delete sigs[k];
      const s = app.session.state;
      MD.Forces.sideCarriers(s, 'J').forEach(function (c) {
        box.appendChild(el(cardHtml(c)));
      });
      box.onclick = function (e) {
        const card = e.target.closest('.card');
        if (!card) return;
        const id = card.dataset.carrier;
        const act = e.target.dataset && e.target.dataset.act;
        if (act) Cards.act(id, act);
        else app.select(id);
      };
      const fo = document.getElementById('fleet-orders');
      fo.innerHTML =
        '<div class="row">COURSE <b id="fo-course">135°</b> · <b id="fo-speed">24 kt</b>' +
        '<span style="margin-left:auto"></span>' +
        [12, 18, 24, 30].map(function (k) { return '<button class="tbtn" data-kt="' + k + '">' + k + '</button>'; }).join('') +
        '</div>' +
        '<div class="row">SEARCH PLANES <b id="fo-scouts">9</b> ready<span style="margin-left:auto"></span><button class="tbtn" id="fo-search" title="Then click the chart, or right-drag from the fleet">SEARCH ▸</button></div>' +
        '<div class="row"><button class="tbtn" id="fo-launch-all" style="flex:1" title="Every spotted strike, together, at the target (L)">LAUNCH ALL SPOTTED ▸</button><button class="tbtn" id="fo-focus" title="Centre on the fleet (F)">⌖ FLEET</button></div>';
      fo.onclick = function (e) {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.kt) app.session.order({ type: 'speed', kt: Number(b.dataset.kt) });
        else if (b.id === 'fo-search') app.beginSearchAim();
        else if (b.id === 'fo-launch-all') app.launchAll();
        else if (b.id === 'fo-focus') app.focusFleet();
      };
    },

    act: function (id, act) {
      const s = app.session.state;
      const c = s.carriers[id];
      app.select(id, true);
      if (act === 'spot') app.session.order({ type: 'spot', carrier: id });
      else if (act === 'clear') app.session.order({ type: 'strikeDown', carrier: id });
      else if (act === 'rearm') {
        const to = c.rearm ? (c.rearm.to === 'ship' ? 'land' : 'ship') : c.arm.D === 'ship' && c.arm.T === 'ship' ? 'land' : 'ship';
        app.session.order({ type: 'rearm', carrier: id, to: to });
      } else if (act === 'launch') app.launchFrom([id]);
      else if (act === 'cap+') app.session.order({ type: 'cap', carrier: id, n: c.cap.target + 3 });
      else if (act === 'cap-') app.session.order({ type: 'cap', carrier: id, n: c.cap.target - 3 });
    },

    update: function () {
      const s = app.session.state;
      const ui = app.session.view.ui;
      const cards = document.querySelectorAll('#cards .card');
      cards.forEach(function (card) {
        const c = s.carriers[card.dataset.carrier];
        const tk = task(s, c);
        const ch = chip(c);
        const sig = [s.t, c.status, c.deck.state, c.rearm ? c.rearm.until : 0, c.hangar.F, c.hangar.D, c.hangar.T, c.cap.up, c.cap.target, c.arm.D, c.arm.T, ui.selected === c.id, tk.text].join('|');
        if (sigs[c.id] === sig) return;
        sigs[c.id] = sig;
        const dead = !MD.Forces.fighting(c);
        card.classList.toggle('dead', dead);
        card.classList.toggle('ready', c.deck.state === 'spotted');
        card.classList.toggle('selected', ui.selected === c.id);
        const chipEl = card.querySelector('.chip');
        chipEl.className = 'chip ' + ch[0];
        chipEl.textContent = ch[1];
        drawDeck(card.querySelector('.deck'), s, c);
        const bar = card.querySelector('.task');
        bar.classList.toggle('hot', !!tk.hot);
        bar.querySelector('i').style.width = Math.round(tk.f * 100) + '%';
        bar.querySelector('span').textContent = tk.text;
        const armTag = function (a) {
          return '<span class="arm ' + a + '">' + (a === 'land' ? 'LAND' : 'SHIP') + '</span>';
        };
        card.querySelector('.hangar').innerHTML = dead
          ? '<span>' + (c.status === 'sunk' ? 'Lost with all aircraft aboard.' : 'Abandon ship ordered at dusk.') + '</span>'
          : 'F <b>' + c.hangar.F + '</b> D <b>' + c.hangar.D + '</b>' + armTag(c.arm.D) + ' T <b>' + c.hangar.T + '</b>' + armTag(c.arm.T) +
            '<span class="cap" style="margin-left:auto">CAP <button data-act="cap-" title="Fewer fighters on patrol">−</button><b>' + c.cap.up + (c.cap.up !== c.cap.target ? '→' + c.cap.target : '') + '</b><button data-act="cap+" title="More fighters on patrol">+</button></span>';
        const can = function (act) {
          if (dead || s.t < c.deckOutUntil) return false;
          if (act === 'spot') return c.deck.state === 'idle' && !c.rearm && c.hangar.D + c.hangar.T > 0;
          if (act === 'launch') return c.deck.state === 'spotted';
          if (act === 'clear') return c.deck.state === 'spotted' || c.deck.state === 'spotting';
          if (act === 'rearm') return c.deck.state !== 'launching' && c.deck.state !== 'unspotting';
          return true;
        };
        card.querySelectorAll('.card-btns button').forEach(function (b) {
          b.disabled = !can(b.dataset.act);
        });
        const rb = card.querySelector('[data-act="rearm"]');
        const toShip = c.rearm ? c.rearm.to !== 'ship' : !(c.arm.D === 'ship' && c.arm.T === 'ship');
        rb.textContent = toShip ? 'ARM ⇄ TORP' : 'ARM ⇄ LAND';
      });
      const kb = s.groups.KB;
      document.getElementById('fo-course').textContent = Math.round(kb.waypoint ? MD.Geo.bearing(kb, kb.waypoint) : kb.orderCourse) + '°';
      document.getElementById('fo-speed').textContent = Math.round(kb.speed) + ' kt';
      document.getElementById('fo-scouts').textContent = MD.Scouting.readyScouts(s).length;
      document.querySelectorAll('#fleet-orders [data-kt]').forEach(function (b) {
        b.classList.toggle('on', Number(b.dataset.kt) === kb.orderSpeed);
      });
    },
  };

  MD.Cards = Cards;
})(globalThis.MD = globalThis.MD || {});
