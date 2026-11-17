// The signals panel: every report, raid warning and strike result arrives as a paper slip, typed out letter by
// letter, the urgent ones stamped in red. Clicking a slip shows its position on the chart.
(function (MD) {
  'use strict';

  const MAX = 40;
  const CPS = 90;
  let app = null;
  let typing = [];

  function stampFor(e) {
    if (e.kind === 'raid') return '空襲';
    if (e.kind === 'report' && e.urgent) return '緊急';
    if (e.kind === 'damage' && e.level === 'fatal') return '大破';
    if (e.kind === 'bombing' && e.urgent) return '戦果';
    if (e.kind === 'end') return '終';
    return '';
  }

  function classFor(e) {
    let cls = 'tg';
    if (e.urgent || e.kind === 'raid') cls += ' urgent';
    if (e.kind === 'report' || e.kind === 'raid') cls += ' enemy';
    if (e.kind === 'deck') cls += ' ours dim';
    return cls;
  }

  const Telegrams = {
    bind: function (theApp) {
      app = theApp;
      const box = document.getElementById('telegrams');
      box.innerHTML = '';
      typing = [];
      box.onclick = function (e) {
        const slip = e.target.closest('.tg');
        if (!slip || slip.dataset.x === undefined) return;
        app.lookAt({ x: Number(slip.dataset.x), y: Number(slip.dataset.y) }, slip.dataset.report || null);
      };
    },

    /** Adds a slip for a battle event (instant = no typewriter, for screenshots and catching up). */
    add: function (e, instant) {
      if (!e.text || e.kind === 'airbattle') return;
      const box = document.getElementById('telegrams');
      const slip = document.createElement('div');
      slip.className = classFor(e) + (stampFor(e) ? ' stamped' : '');
      if (typeof e.x === 'number') {
        slip.dataset.x = e.x;
        slip.dataset.y = e.y;
        slip.title = 'Show on the chart';
      }
      if (e.report) slip.dataset.report = e.report;
      const stamp = stampFor(e);
      slip.innerHTML = (stamp ? '<span class="stamp">' + stamp + '</span>' : '') + '<span class="tg-time">' + MD.Geo.clock(e.t) + '</span><span class="tg-body"></span>';
      box.insertBefore(slip, box.firstChild);
      const body = slip.querySelector('.tg-body');
      if (instant) body.textContent = e.text;
      else typing.push({ el: body, text: e.text, shown: 0 });
      while (box.children.length > MAX) box.removeChild(box.lastChild);
    },

    /** Advances the typewriters. */
    update: function (dt) {
      if (!typing.length) return;
      const t = typing[0];
      const before = Math.floor(t.shown);
      t.shown += dt * CPS * (typing.length > 3 ? 4 : 1);
      const n = Math.min(t.text.length, Math.floor(t.shown));
      if (n !== before) {
        t.el.innerHTML = '';
        t.el.textContent = t.text.slice(0, n);
        if (n < t.text.length) {
          const cur = document.createElement('span');
          cur.className = 'cursor';
          t.el.appendChild(cur);
        }
        if (n % 3 === 0) MD.Sound.type();
      }
      if (n >= t.text.length) typing.shift();
    },

    flush: function () {
      for (let i = 0; i < typing.length; i++) typing[i].el.textContent = typing[i].text;
      typing = [];
    },
  };

  MD.Telegrams = Telegrams;
})(globalThis.MD = globalThis.MD || {});
