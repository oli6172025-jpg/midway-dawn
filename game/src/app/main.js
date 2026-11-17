// The application: title screen, battle and debrief, the animation loop, and the commands the panels and the
// chart share (select a carrier, aim and launch a strike, send a search, centre the view).
(function (MD) {
  'use strict';

  const $ = function (id) {
    return document.getElementById(id);
  };

  const App = {
    mode: 'title',
    session: null,
    camera: null,
    canvas: null,
    ctx: null,
    difficulty: 'historical',
    fixedNow: null,
    lastFrame: 0,
    cardTimer: 0,
    debriefAt: -1,

    init: function () {
      App.canvas = $('sea');
      App.ctx = App.canvas.getContext('2d');
      App.camera = new MD.Camera();
      MD.Sea.init();
      MD.Hud.bind(App);
      MD.Input.bind(App, App.canvas);
      App.bindTitle();
      window.addEventListener('resize', App.resize);
      App.resize();
      const params = new URLSearchParams(window.location.search);
      if (params.get('shot')) MD.Showcase.run(App, Number(params.get('shot')), Number(params.get('seed') || 7));
      else App.showTitle();
      requestAnimationFrame(App.frame);
    },

    resize: function () {
      App.canvas.width = window.innerWidth;
      App.canvas.height = window.innerHeight;
      App.camera.resize(App.canvas.width, App.canvas.height, App.mode === 'play');
    },

    now: function () {
      return App.fixedNow !== null ? App.fixedNow : performance.now() / 1000;
    },

    bindTitle: function () {
      document.querySelectorAll('.dbtn').forEach(function (b) {
        b.addEventListener('click', function () {
          MD.Sound.unlock();
          MD.Sound.click();
          App.difficulty = b.dataset.diff;
          document.querySelectorAll('.dbtn').forEach(function (x) {
            x.classList.toggle('on', x === b);
          });
        });
      });
      $('btn-dice').addEventListener('click', function () {
        MD.Sound.unlock();
        MD.Sound.click();
        $('seed').value = 1 + Math.floor(Math.random() * 99999);
      });
      $('btn-start').addEventListener('click', function () {
        MD.Sound.unlock();
        MD.Sound.click();
        App.startBattle(Math.max(1, Math.floor(Number($('seed').value) || 1942)), App.difficulty);
      });
    },

    showTitle: function () {
      App.mode = 'title';
      App.session = null;
      MD.UI.showPlayPanels(false);
      MD.Debrief.hide();
      $('tutorial').classList.add('hidden');
      $('paused-banner').classList.add('hidden');
      $('title').classList.remove('hidden');
      MD.Records.render();
      App.resize();
    },

    startBattle: function (seed, difficulty) {
      $('title').classList.add('hidden');
      MD.Debrief.hide();
      App.mode = 'play';
      App.debriefAt = -1;
      App.difficulty = difficulty;
      MD.Effects.reset(seed);
      App.session = new MD.Session({ seed: seed, difficulty: difficulty, startPaused: true });
      MD.UI.showPlayPanels(true);
      MD.Telegrams.bind(App);
      MD.Cards.build(App);
      App.session.onEvent(function (e) {
        MD.Telegrams.add(e, false);
        if (e.kind === 'end') App.debriefAt = App.now() + 3.5;
        // The battle camera: when bombs fall, go and watch.
        if (App.session.autopause && (e.kind === 'bombing' || e.kind === 'midway')) App.camera.flyTo({ x: e.x, y: e.y }, Math.max(App.camera.zoom, 2.4));
        if (App.session.autopause && e.kind === 'raid') App.camera.flyTo(App.session.state.groups.KB, Math.max(App.camera.zoom, 1.6));
      });
      App.session.drainEvents(App.now());
      App.resize();
      App.camera.jump({ x: -45, y: 105 }, 1.3);
      MD.Tutorial.start(false, null);
    },

    showDebrief: function () {
      App.mode = 'debrief';
      MD.Telegrams.flush();
      MD.UI.showPlayPanels(false);
      $('paused-banner').classList.add('hidden');
      $('tutorial').classList.add('hidden');
      App.session.view.reveal = true;
      App.resize();
      App.fitAll();
      const best = App.fixedNow === null && MD.Records.add(App.session.state);
      MD.Debrief.show(App, best);
    },

    /** Frames every task group, Midway and the day's tracks. */
    fitAll: function () {
      const s = App.session.state;
      let x0 = -20;
      let x1 = 20;
      let y0 = -20;
      let y1 = 20;
      for (const id in s.groups) {
        const pts = s.groups[id].trail.concat([s.groups[id]]);
        for (let i = 0; i < pts.length; i++) {
          x0 = Math.min(x0, pts[i].x);
          x1 = Math.max(x1, pts[i].x);
          y0 = Math.min(y0, pts[i].y);
          y1 = Math.max(y1, pts[i].y);
        }
      }
      const cam = App.camera;
      const zoom = Math.min((cam.w - cam.insetLeft - cam.insetRight - 60) / (x1 - x0 + 60), (cam.h - cam.insetTop - 60) / (y1 - y0 + 60));
      App.camera.jump({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, Math.max(0.6, Math.min(2.2, zoom)));
    },

    select: function (id, keep) {
      const ui = App.session.view.ui;
      ui.selected = keep || ui.selected !== id ? id : null;
    },

    cycleSelection: function () {
      const live = MD.Forces.sideCarriers(App.session.state, 'J').filter(MD.Forces.fighting);
      if (!live.length) return;
      const ui = App.session.view.ui;
      const i = live.findIndex(function (c) { return c.id === ui.selected; });
      ui.selected = live[(i + 1) % live.length].id;
    },

    /** Launch these carriers' spotted strikes: at the target if one is set, else ask for a click on the chart. */
    launchFrom: function (ids) {
      const s = App.session.state;
      const ui = App.session.view.ui;
      const carriers = ids.map(function (id) { return s.carriers[id]; }).filter(function (c) { return c.deck.state === 'spotted'; });
      if (!carriers.length) {
        App.session.order({ type: 'launch', carriers: ids, x: 0, y: 0 });
        return;
      }
      if (ui.target) {
        App.session.order({ type: 'launch', carriers: carriers.map(function (c) { return c.id; }), x: ui.target.x, y: ui.target.y });
        return;
      }
      let radius = Infinity;
      carriers.forEach(function (c) { radius = Math.min(radius, MD.Deck.rangeOf(c, c.deck.pkg).radius); });
      ui.aiming = { carriers: carriers.map(function (c) { return c.id; }), radius: radius, label: carriers.map(function (c) { return c.name; }).join(' + ') };
      MD.UI.hint('Click the chart to send the strike · Esc to cancel');
    },

    launchAll: function () {
      const spotted = MD.Forces.sideCarriers(App.session.state, 'J').filter(function (c) { return MD.Forces.fighting(c) && c.deck.state === 'spotted'; });
      if (!spotted.length) {
        MD.UI.notice('No strike is spotted on any deck. SPOT one first (35–55 min).', true);
        MD.Sound.refuse();
        return;
      }
      App.launchFrom(spotted.map(function (c) { return c.id; }));
    },

    beginSearchAim: function () {
      App.session.view.ui.searchAim = true;
      MD.UI.hint('Click the chart where the search line should reach · or right-drag from the fleet');
    },

    focusFleet: function () {
      App.camera.flyTo(App.session.state.groups.KB, Math.max(App.camera.zoom, 1.3));
    },

    lookAt: function (p, reportId) {
      App.camera.flyTo(p, Math.max(App.camera.zoom, 1.4));
      if (reportId) {
        const ui = App.session.view.ui;
        ui.selectedReport = reportId;
        const r = App.session.state.intel.J.filter(function (x) { return x.id === reportId; })[0];
        if (r) ui.target = { x: r.x, y: r.y };
      }
    },

    frame: function (ts) {
      const now = App.now();
      const dt = Math.min(0.1, App.lastFrame ? ts / 1000 - App.lastFrame : 0.016);
      App.lastFrame = ts / 1000;
      const ctx = App.ctx;
      const cam = App.camera;
      if (App.mode === 'title') {
        MD.TitleScene.draw(ctx, cam.w, cam.h, now);
      } else if (App.session) {
        if (App.mode === 'play' && App.fixedNow === null) App.session.tick(dt, now);
        cam.update(dt);
        MD.Effects.update(now);
        MD.Renderer.drawChart(ctx, cam, App.session.view, now);
        if (App.mode === 'play') {
          MD.Hud.update(App.session);
          MD.Telegrams.update(dt);
          App.cardTimer -= dt;
          if (App.cardTimer <= 0) {
            MD.Cards.update();
            App.cardTimer = 0.15;
          }
          if (App.debriefAt > 0 && now >= App.debriefAt) App.showDebrief();
        }
      }
      if (App.onFrame) App.onFrame();
      requestAnimationFrame(App.frame);
    },
  };

  MD.App = App;
  window.addEventListener('DOMContentLoaded', App.init);
})(globalThis.MD = globalThis.MD || {});
