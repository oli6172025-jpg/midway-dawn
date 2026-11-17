// One battle being played: the simulation state, the clock (1 game minute = 0.25 s at 1x; 2x and 4x), pause and
// auto-pause, the player's orders with their feedback, and the hand-off of every new battle event to the
// telegrams, the effects and the sound.
(function (MD) {
  'use strict';

  const SECONDS_PER_MINUTE = 0.25;

  /** Which events the Japanese player hears about. */
  function forPlayer(e) {
    if (e.side === 'A') return false;
    if (e.kind === 'airbattle') return true;
    return !!e.text;
  }

  function Session(opts) {
    this.seed = opts.seed;
    this.difficulty = opts.difficulty;
    this.state = MD.Sim.create({ seed: opts.seed, difficulty: opts.difficulty });
    this.speed = 1;
    this.paused = !!opts.startPaused;
    this.autopause = opts.autopause !== false;
    this.acc = 0;
    this.logIndex = 0;
    this.listeners = [];
    this.endedAt = -1;
    this.view = {
      state: this.state,
      prev: MD.Renderer.snapshot(this.state),
      alpha: 0,
      reveal: false,
      hulks: {},
      ui: { selected: null, target: null, selectedReport: null, drag: null, aiming: null, hover: null },
    };
  }

  Session.prototype.onEvent = function (fn) {
    this.listeners.push(fn);
  };

  /** Gives an order; the result's message is shown to the player either way. */
  Session.prototype.order = function (o) {
    const r = MD.Sim.order(this.state, o);
    if (MD.UI && MD.UI.notice) MD.UI.notice(r.msg, !r.ok);
    if (r.ok) MD.Sound.click();
    else MD.Sound.refuse();
    if (r.ok && o.type === 'launch') MD.Sound.launch();
    if (r.ok && o.type === 'scout') MD.Sound.launch();
    return r;
  };

  Session.prototype.setPaused = function (p) {
    this.paused = p;
  };

  Session.prototype.togglePause = function () {
    this.paused = !this.paused;
  };

  Session.prototype.setSpeed = function (s) {
    this.speed = s;
    this.paused = false;
  };

  /** Advances the battle by real seconds `dt`, stepping whole minutes and pausing on important news. */
  Session.prototype.tick = function (dt, now) {
    if (this.state.over) {
      this.view.alpha = 1;
      this.drainEvents(now);
      return;
    }
    if (!this.paused) {
      this.acc += (dt * this.speed) / SECONDS_PER_MINUTE;
      let steps = 0;
      while (this.acc >= 1 && steps < 12) {
        this.view.prev = MD.Renderer.snapshot(this.state);
        MD.Sim.step(this.state);
        this.acc -= 1;
        steps++;
        if (this.drainEvents(now) || this.state.over) {
          this.acc = 0;
          break;
        }
      }
      if (this.acc > 3) this.acc = 0;
    }
    this.view.alpha = this.paused ? 1 : Math.min(1, this.acc);
  };

  /** Hands new events on; returns true when one of them paused the game. */
  Session.prototype.drainEvents = function (now) {
    let paused = false;
    const log = this.state.log;
    while (this.logIndex < log.length) {
      const e = log[this.logIndex++];
      if (!forPlayer(e)) continue;
      MD.Effects.fromEvent(e, this.state, now);
      MD.Sound.forEvent(e);
      for (let i = 0; i < this.listeners.length; i++) this.listeners[i](e);
      if (e.kind === 'end') this.endedAt = now;
      if (this.autopause && e.pause && !this.state.over && e.t > 0) {
        this.paused = true;
        paused = true;
      }
    }
    return paused;
  };

  MD.Session = Session;
})(globalThis.MD = globalThis.MD || {});
