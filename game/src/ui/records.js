// The admiral's service record: battles fought, won and the best margin, per difficulty, kept in this browser
// (localStorage, when the browser allows it) and shown on the title screen.
(function (MD) {
  'use strict';

  const KEY = 'midway-dawn-records-v1';

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function save(all) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) {
      // Storage refused (a private window): the record lasts only this visit.
    }
  }

  const Records = {
    /** Notes a finished battle; returns true when its margin is a new best for that difficulty. */
    add: function (state) {
      const all = load();
      const sc = MD.Sim.score(state);
      const margin = sc.J - sc.A;
      const r = all[state.difficulty] || { fought: 0, won: 0, best: null };
      r.fought += 1;
      if (state.result === 'victory') r.won += 1;
      const isBest = r.best === null || margin > r.best;
      if (isBest) r.best = margin;
      all[state.difficulty] = r;
      save(all);
      Records.render();
      return isBest;
    },

    /** "Historical 3 / 7 won · best +28" lines under the title menu. */
    render: function () {
      const el = document.getElementById('records');
      if (!el) return;
      const all = load();
      const parts = [];
      ['novice', 'historical', 'admiral'].forEach(function (d) {
        const r = all[d];
        if (!r || !r.fought) return;
        parts.push(MD.Data.difficulty[d].name + ' ' + r.won + ' / ' + r.fought + ' won · best ' + (r.best > 0 ? '+' : '') + r.best);
      });
      el.textContent = parts.length ? 'Service record — ' + parts.join('   ·   ') : '';
    },
  };

  MD.Records = Records;
})(globalThis.MD = globalThis.MD || {});
