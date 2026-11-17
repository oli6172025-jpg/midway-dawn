// Mouse and keyboard. On the chart: drag to pan, wheel to zoom, click to set the strike target (a sighting
// diamond or Midway snaps it), right-drag from anywhere to send a search plane, drag the fleet to set its course.
// From a carrier card: drag onto the chart to launch its strike there. Keys: Space pause, 1/2/3 speed, F fleet,
// L launch all, S spot, R rearm, C clear deck, Tab next carrier, M sound, H help, Esc cancel.
(function (MD) {
  'use strict';

  let app = null;
  let canvas = null;
  let drag = null;

  function worldAt(e) {
    return app.camera.toWorld(e.clientX, e.clientY);
  }

  function nearScreen(p, e, px) {
    const s = app.camera.toScreen(p);
    return Math.hypot(s.x - e.clientX, s.y - e.clientY) <= px;
  }

  /** The sighting report under the pointer, if any. */
  function reportAt(e) {
    const s = app.session.state;
    const list = s.intel.J.filter(function (r) { return r.t <= s.t; });
    for (let i = list.length - 1; i >= 0; i--) if (nearScreen(list[i], e, 11)) return list[i];
    return null;
  }

  function onChartClick(e) {
    const s = app.session.state;
    const ui = app.session.view.ui;
    const w = worldAt(e);
    if (ui.aiming) {
      const ids = ui.aiming.carriers;
      ui.aiming = null;
      MD.UI.hint(null);
      app.session.order({ type: 'launch', carriers: ids, x: w.x, y: w.y });
      return;
    }
    if (ui.searchAim) {
      ui.searchAim = false;
      MD.UI.hint(null);
      const kb = s.groups.KB;
      app.session.order({ type: 'scout', bearing: MD.Geo.bearing(kb, w), range: Math.max(80, Math.min(300, MD.Geo.dist(kb, w))) });
      return;
    }
    const r = reportAt(e);
    if (r) {
      ui.selectedReport = r.id;
      ui.target = { x: r.x, y: r.y };
      MD.UI.notice('Target set on the ' + MD.Geo.clock(r.obsT) + ' sighting (' + MD.Geo.fix(r) + '). Launch to strike it.');
      MD.Sound.click();
      return;
    }
    if (nearScreen({ x: 0, y: 0 }, e, 16)) {
      ui.target = { x: 0, y: 0 };
      ui.selectedReport = null;
      MD.UI.notice('Target: Midway airfield.');
      MD.Sound.click();
      return;
    }
    ui.target = { x: w.x, y: w.y };
    ui.selectedReport = null;
  }

  const Input = {
    bind: function (theApp, theCanvas) {
      app = theApp;
      canvas = theCanvas;

      canvas.addEventListener('contextmenu', function (e) {
        e.preventDefault();
      });

      canvas.addEventListener('pointerdown', function (e) {
        MD.Sound.unlock();
        if (app.mode !== 'play') return;
        const kb = app.session.state.groups.KB;
        if (e.button === 2) {
          drag = { kind: 'search', world: worldAt(e) };
        } else if (e.button === 0) {
          if (!app.session.view.ui.aiming && !app.session.view.ui.searchAim && nearScreen(kb, e, 24)) drag = { kind: 'course', world: worldAt(e), moved: false, sx: e.clientX, sy: e.clientY };
          else drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
        }
        app.session.view.ui.drag = drag;
      });

      document.getElementById('cards').addEventListener('pointerdown', function (e) {
        MD.Sound.unlock();
        if (app.mode !== 'play' || e.button !== 0 || e.target.closest('button')) return;
        const card = e.target.closest('.card');
        if (!card) return;
        const c = app.session.state.carriers[card.dataset.carrier];
        if (c.deck.state !== 'spotted') return;
        const r = MD.Deck.rangeOf(c, c.deck.pkg);
        drag = { kind: 'launch', carriers: [c.id], radius: r.radius, label: c.name, world: null };
        app.session.view.ui.drag = drag;
      });

      window.addEventListener('pointermove', function (e) {
        if (app.mode !== 'play') return;
        const ui = app.session.view.ui;
        const overChart = e.target === canvas;
        ui.hover = overChart ? worldAt(e) : null;
        if (!drag) return;
        if (drag.kind === 'pan') {
          if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
          if (drag.moved) app.camera.panBy(e.clientX - drag.lx, e.clientY - drag.ly);
          drag.lx = e.clientX;
          drag.ly = e.clientY;
        } else {
          drag.world = overChart || drag.kind !== 'launch' ? worldAt(e) : null;
          if (drag.kind === 'course' && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
        }
      });

      window.addEventListener('pointerup', function (e) {
        if (!drag || app.mode !== 'play') {
          drag = null;
          return;
        }
        const d = drag;
        drag = null;
        app.session.view.ui.drag = null;
        const s = app.session.state;
        const kb = s.groups.KB;
        const overChart = e.target === canvas;
        if (d.kind === 'pan') {
          if (!d.moved && overChart) onChartClick(e);
        } else if (d.kind === 'search') {
          const w = worldAt(e);
          if (MD.Geo.dist(kb, w) > 15) app.session.order({ type: 'scout', bearing: MD.Geo.bearing(kb, w), range: Math.max(80, Math.min(300, MD.Geo.dist(kb, w))) });
        } else if (d.kind === 'course') {
          if (d.moved) {
            const w = worldAt(e);
            app.session.order({ type: 'course', x: w.x, y: w.y });
          } else onChartClick(e);
        } else if (d.kind === 'launch') {
          if (overChart) {
            const w = worldAt(e);
            const snap = reportAt(e);
            const aim = snap ? { x: snap.x, y: snap.y } : nearScreen({ x: 0, y: 0 }, e, 16) ? { x: 0, y: 0 } : w;
            app.session.order({ type: 'launch', carriers: d.carriers, x: aim.x, y: aim.y });
          }
        }
      });

      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        if (app.mode !== 'play' && app.mode !== 'debrief') return;
        app.camera.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      }, { passive: false });

      window.addEventListener('keydown', function (e) {
        MD.Sound.unlock();
        if (app.mode !== 'play' || e.target.tagName === 'INPUT') return;
        const s = app.session;
        const ui = s.view.ui;
        const k = e.key.toLowerCase();
        if (k === ' ') {
          e.preventDefault();
          s.togglePause();
        } else if (k === '1') s.setSpeed(1);
        else if (k === '2') s.setSpeed(2);
        else if (k === '3' || k === '4') s.setSpeed(4);
        else if (k === 'f') app.focusFleet();
        else if (k === 'l') app.launchAll();
        else if (k === 'escape') {
          ui.aiming = null;
          ui.searchAim = false;
          ui.target = null;
          drag = null;
          ui.drag = null;
          MD.UI.hint(null);
        } else if (k === 'tab') {
          e.preventDefault();
          app.cycleSelection();
        } else if (k === 'm') document.getElementById('btn-sound').click();
        else if (k === 'h' || k === '?') document.getElementById('btn-help').click();
        else if (k === '+' || k === '=') app.camera.zoomAt(app.camera.cx(), app.camera.cy(), 1.25);
        else if (k === '-') app.camera.zoomAt(app.camera.cx(), app.camera.cy(), 0.8);
        else if (ui.selected && (k === 's' || k === 'r' || k === 'c')) {
          MD.Cards.act(ui.selected, k === 's' ? 'spot' : k === 'r' ? 'rearm' : 'clear');
        }
      });
    },
  };

  MD.Input = Input;
})(globalThis.MD = globalThis.MD || {});
