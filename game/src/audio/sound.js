// Every sound in the game, synthesised with WebAudio: the sea, radial engines, Morse on the wireless, the
// typewriter of the signals office, the raid klaxon, anti-aircraft fire, bomb bursts and the end-of-battle chords.
// Nothing is loaded from a file. The context starts on the first click or key, as browsers require.
(function (MD) {
  'use strict';

  let ac = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;
  let seaNode = null;
  const lastPlayed = {};

  function ensure() {
    if (ac) return ac;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    const rnd = MD.Rng.stream(5);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    return ac;
  }

  function noise(dur, filterType, freq, q) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = dur > 2;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q || 1;
    src.connect(f);
    return { src: src, out: f, filter: f };
  }

  function env(node, t0, attack, hold, release, peak) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    node.connect(g);
    g.connect(master);
    return g;
  }

  function tone(type, freq, t0, dur, peak, glideTo) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    env(o, t0, 0.01, dur * 0.3, dur * 0.7, peak);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /** Throttle: the same sound no more often than every `gap` seconds. */
  function allowed(name, gap) {
    const now = ac.currentTime;
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < gap) return false;
    lastPlayed[name] = now;
    return true;
  }

  const Sound = {
    unlock: function () {
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume();
      Sound.sea();
    },

    setMuted: function (m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ac.currentTime, 0.05);
    },

    isMuted: function () {
      return muted;
    },

    /** The constant hush of the ocean under everything. */
    sea: function () {
      if (!ac || seaNode) return;
      const n = noise(3, 'lowpass', 420, 0.4);
      const g = ac.createGain();
      g.gain.value = 0.06;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      n.out.connect(g);
      g.connect(master);
      n.src.start();
      lfo.start();
      seaNode = n;
    },

    click: function () {
      if (!ac || !allowed('click', 0.04)) return;
      tone('square', 1800, ac.currentTime, 0.03, 0.05);
    },

    refuse: function () {
      if (!ac || !allowed('refuse', 0.2)) return;
      const t = ac.currentTime;
      tone('square', 220, t, 0.12, 0.08);
      tone('square', 160, t + 0.13, 0.18, 0.08);
    },

    /** Morse on the wireless: the call letters of an incoming signal. */
    morse: function (urgent) {
      if (!ac || !allowed('morse', 0.6)) return;
      const pattern = urgent ? '-.-. ...- -.-. ...-' : '.-. . .--.';
      let t = ac.currentTime + 0.02;
      const unit = 0.055;
      for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === ' ') {
          t += unit * 3;
          continue;
        }
        const len = ch === '-' ? unit * 3 : unit;
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = 760;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.09, t + 0.005);
        g.gain.setValueAtTime(0.09, t + len - 0.005);
        g.gain.linearRampToValueAtTime(0.0001, t + len);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + len + 0.01);
        t += len + unit;
      }
    },

    /** One typewriter key. */
    type: function () {
      if (!ac || !allowed('type', 0.035)) return;
      const t = ac.currentTime;
      const n = noise(0.05, 'bandpass', 2600 + Math.random() * 900, 3);
      env(n.out, t, 0.002, 0.005, 0.03, 0.12);
      n.src.start(t);
      n.src.stop(t + 0.06);
    },

    /** Radial engines running up and away: a strike or a search plane taking off. */
    launch: function () {
      if (!ac || !allowed('launch', 1.5)) return;
      const t = ac.currentTime;
      for (let k = 0; k < 3; k++) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(48 + k * 7, t);
        o.frequency.exponentialRampToValueAtTime(92 + k * 9, t + 1.6);
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 520;
        o.connect(f);
        env(f, t + k * 0.25, 0.4, 0.8, 1.6, 0.06);
        o.start(t + k * 0.25);
        o.stop(t + 3.4);
      }
    },

    /** The raid klaxon. */
    alarm: function () {
      if (!ac || !allowed('alarm', 3)) return;
      const t = ac.currentTime;
      for (let i = 0; i < 4; i++) {
        tone('square', i % 2 ? 520 : 690, t + i * 0.32, 0.3, 0.07);
      }
    },

    /** Anti-aircraft fire and machine guns: a ragged string of pops. */
    guns: function () {
      if (!ac || !allowed('guns', 1)) return;
      const t = ac.currentTime;
      for (let i = 0; i < 22; i++) {
        const at = t + i * 0.09 + Math.random() * 0.05;
        const n = noise(0.08, 'bandpass', 900 + Math.random() * 1200, 1.5);
        env(n.out, at, 0.002, 0.01, 0.07, 0.08 + Math.random() * 0.05);
        n.src.start(at);
        n.src.stop(at + 0.1);
      }
    },

    /** A bomb burst or a ship exploding: a noise blast with a falling filter and a low thump. */
    boom: function (big, delay) {
      if (!ac) return;
      const t = ac.currentTime + (delay || 0);
      const n = noise(2, 'lowpass', big ? 1400 : 2200, 0.7);
      n.filter.frequency.setValueAtTime(big ? 1400 : 2400, t);
      n.filter.frequency.exponentialRampToValueAtTime(90, t + (big ? 2.2 : 1));
      env(n.out, t, 0.005, 0.05, big ? 2.2 : 0.9, big ? 0.5 : 0.28);
      n.src.start(t);
      n.src.stop(t + 2.6);
      tone('sine', big ? 55 : 80, t, big ? 1.4 : 0.6, big ? 0.45 : 0.25, 30);
    },

    splash: function (delay) {
      if (!ac) return;
      const t = ac.currentTime + (delay || 0);
      const n = noise(0.6, 'highpass', 900, 0.6);
      env(n.out, t, 0.01, 0.05, 0.45, 0.07);
      n.src.start(t);
      n.src.stop(t + 0.7);
    },

    /** A short chord for the end of the battle: bright for victory, low and minor for defeat. */
    finale: function (result) {
      if (!ac) return;
      const t = ac.currentTime + 0.1;
      const chords = result === 'victory' ? [[261.6, 329.6, 392], [293.7, 370, 440], [329.6, 415.3, 493.9]] : result === 'defeat' ? [[220, 261.6, 329.6], [196, 233.1, 293.7], [174.6, 207.7, 261.6]] : [[220, 293.7, 349.2], [220, 277.2, 329.6]];
      for (let c = 0; c < chords.length; c++) {
        for (let k = 0; k < chords[c].length; k++) {
          const o = ac.createOscillator();
          o.type = 'triangle';
          o.frequency.value = chords[c][k];
          env(o, t + c * 0.9, 0.08, 0.5, 1.2, 0.07);
          o.start(t + c * 0.9);
          o.stop(t + c * 0.9 + 2);
        }
      }
    },

    /** Plays what a battle event sounds like. */
    forEvent: function (e) {
      if (!ac) return;
      if (e.kind === 'report') Sound.morse(e.urgent);
      else if (e.kind === 'raid') Sound.alarm();
      else if (e.kind === 'airbattle') Sound.guns();
      else if (e.kind === 'bombing') {
        let n = 0;
        for (const id in e.tally) n += e.tally[id].bombs + e.tally[id].torps;
        for (let i = 0; i < Math.min(6, n); i++) Sound.boom(false, 1.2 + i * 0.4);
        for (let i = 0; i < 4; i++) Sound.splash(0.8 + i * 0.5);
      } else if (e.kind === 'damage' && e.level === 'fatal') Sound.boom(true, 2.2);
      else if (e.kind === 'midway') for (let i = 0; i < 5; i++) Sound.boom(i === 0, 1 + i * 0.3);
      else if (e.kind === 'flight' && e.launch && e.side === 'J') Sound.launch();
      else if (e.kind === 'end') Sound.finale(e.result);
    },
  };

  MD.Sound = Sound;
})(globalThis.MD = globalThis.MD || {});
