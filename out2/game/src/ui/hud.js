// The top bar (clock, time controls, score, Midway's airfield) and the one-line notices that answer every order.
(function (MD) {
  'use strict';

  const $ = function (id) {
    return document.getElementById(id);
  };
  let noticeTimer = null;

  const UI = MD.UI || {};

  /** Shows a short message at the bottom of the chart; `bad` for a refused order. */
  UI.notice = function (text, bad) {
    const el = $('notice');
    if (!el || !text) return;
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.toggle('bad', !!bad);
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () {
      el.classList.add('hidden');
    }, bad ? 4200 : 3000);
  };

  UI.hint = function (text) {
    const el = $('hint');
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    el.textContent = text;
    el.classList.remove('hidden');
  };

  UI.showPlayPanels = function (show) {
    ['hud', 'fleet', 'wire'].forEach(function (id) {
      $(id).classList.toggle('hidden', !show);
    });
  };

  const Hud = {
    bind: function (app) {
      $('btn-pause').addEventListener('click', function () {
        if (app.session) app.session.togglePause();
        MD.Sound.click();
      });
      const speeds = document.querySelectorAll('.tbtn.speed');
      speeds.forEach(function (b) {
        b.addEventListener('click', function () {
          if (app.session) app.session.setSpeed(Number(b.dataset.speed));
          MD.Sound.click();
        });
      });
      $('autopause').addEventListener('change', function (e) {
        if (app.session) app.session.autopause = e.target.checked;
      });
      $('btn-sound').addEventListener('click', function () {
        MD.Sound.unlock();
        MD.Sound.setMuted(!MD.Sound.isMuted());
        $('btn-sound').classList.toggle('paused', MD.Sound.isMuted());
      });
      $('btn-help').addEventListener('click', function () {
        if (app.session) {
          app.session.setPaused(true);
          MD.Tutorial.start(true);
        }
      });
    },

    update: function (session) {
      const s = session.state;
      $('clock').textContent = MD.Geo.clock(s.t);
      $('sky-phase').textContent = MD.Palette.phaseName(s.t);
      const sc = MD.Sim.score(s);
      $('score-j').textContent = sc.J;
      $('score-a').textContent = sc.A;
      $('midway-hp').style.width = Math.max(0, s.midway.hp) + '%';
      const pause = $('btn-pause');
      pause.textContent = session.paused ? '▶' : '❚❚';
      pause.classList.toggle('paused', session.paused);
      document.querySelectorAll('.tbtn.speed').forEach(function (b) {
        b.classList.toggle('on', Number(b.dataset.speed) === session.speed);
      });
      $('paused-banner').classList.toggle('hidden', !session.paused || s.over || !MD.Tutorial.done());
    },
  };

  MD.UI = UI;
  MD.Hud = Hud;
})(globalThis.MD = globalThis.MD || {});
