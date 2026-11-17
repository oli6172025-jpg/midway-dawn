// Battle effects on the chart: tracer fire and falling planes in an air battle, bomb bursts and near-miss splashes,
// fireballs, and the fires and smoke of a stricken carrier trailing downwind. Effects are anchored to sea positions
// and timed on the real clock, so they play out even while the battle is paused.
(function (MD) {
  'use strict';

  const TAU = Math.PI * 2;
  let list = [];
  let rnd = MD.Rng.stream(1);

  function add(fx) {
    list.push(fx);
    return fx;
  }

  function jitter(p, nm) {
    const a = rnd() * TAU;
    const r = rnd() * nm;
    return { x: p.x + Math.sin(a) * r, y: p.y + Math.cos(a) * r };
  }

  const Effects = {
    reset: function (seed) {
      list = [];
      rnd = MD.Rng.stream(seed || 1);
    },

    count: function () {
      return list.length;
    },

    /** A burst at a sea point, or on a ship (`carrier`: drawn where that ship is drawn, `dx, dy` pixels off it). */
    explosion: function (p, now, big, carrier) {
      const parts = [];
      for (let i = 0; i < 10; i++) parts.push({ a: rnd() * TAU, v: 0.6 + rnd() * 0.8 });
      return add({ type: 'boom', x: p.x, y: p.y, t0: now, dur: big ? 2.6 : 1.6, big: !!big, parts: parts, carrier: carrier || null, dx: (rnd() - 0.5) * 34, dy: (rnd() - 0.5) * 22 });
    },

    /** A near miss: at a sea point, or beside a ship (`carrier`), a few dozen pixels off her hull. */
    splash: function (p, now, carrier) {
      const a = rnd() * TAU;
      const r = 26 + rnd() * 30;
      return add({ type: 'splash', x: p.x, y: p.y, t0: now, dur: 1.8, carrier: carrier || null, dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.7 });
    },

    /** Tracers, flak and falling planes; `from` (a bearing) moves the fight out toward where the raid came from. */
    dogfight: function (p, now, intensity, falling, from) {
      const off = typeof from === 'number' ? { x: Math.sin((from * Math.PI) / 180) * 70, y: -Math.cos((from * Math.PI) / 180) * 70 } : { x: 0, y: 0 };
      const lines = [];
      const n = 10 + Math.min(30, intensity * 2);
      for (let i = 0; i < n; i++) {
        lines.push({ a: rnd() * TAU, r: 6 + rnd() * 34, len: 6 + rnd() * 10, start: rnd() * 0.8, spin: (rnd() - 0.5) * 3, warm: rnd() < 0.6 });
      }
      add({ type: 'tracers', x: p.x, y: p.y, t0: now, dur: 4.5, lines: lines, ox: off.x, oy: off.y });
      const puffs = [];
      for (let i = 0; i < 14; i++) puffs.push({ dx: (rnd() - 0.5) * 70, dy: (rnd() - 0.5) * 50, start: rnd() * 3, r: 2 + rnd() * 3 });
      add({ type: 'flak', x: p.x, y: p.y, t0: now, dur: 5, puffs: puffs, ox: off.x * 0.5, oy: off.y * 0.5 });
      for (let i = 0; i < Math.min(8, falling); i++) {
        add({ type: 'fall', x: p.x, y: p.y, ox: off.x, oy: off.y, t0: now + rnd() * 2.5, dur: 2.2, dx: (rnd() - 0.5) * 60, dy: (rnd() - 0.5) * 40, drift: (rnd() - 0.5) * 50, spin: rnd() * TAU });
      }
    },

    /** Turns battle events into the effects that show them. */
    fromEvent: function (e, state, now) {
      if (e.kind === 'airbattle') {
        Effects.dogfight({ x: e.x, y: e.y }, now, (e.cap || 0) / 3 + (e.shotDown || 0), Math.ceil((e.shotDown || 0) / 3) + Math.ceil((e.capLosses || 0) / 2), e.from);
      } else if (e.kind === 'bombing') {
        let k = 0;
        let hits = 0;
        for (const id in e.tally) {
          const c = state.carriers[id];
          const n = e.tally[id].bombs + e.tally[id].torps;
          hits += n;
          for (let i = 0; i < Math.min(n, 8); i++) {
            Effects.explosion(jitter(c, 0.8), now + 1.2 + k * 0.4, false, id);
            k++;
          }
        }
        const misses = Math.min(12, Math.max(3, Math.round((e.sent || 20) / 6) - hits));
        const targets = Object.keys(e.tally);
        for (let i = 0; i < misses; i++) {
          const id = targets.length ? targets[i % targets.length] : null;
          Effects.splash(id ? state.carriers[id] : jitter({ x: e.x, y: e.y }, 4), now + 0.8 + rnd() * 2.6, id);
        }
      } else if (e.kind === 'damage' && e.level === 'fatal') {
        Effects.explosion({ x: e.x, y: e.y }, now + 2.2, true, e.carrier);
      } else if (e.kind === 'midway') {
        const n = Math.min(12, Math.round(e.damage / 2) + 3);
        for (let i = 0; i < n; i++) Effects.explosion(jitter({ x: 0, y: 0 }, 2.5), now + 1 + i * 0.3, i % 4 === 0);
      } else if (e.kind === 'sunk') {
        Effects.splash({ x: e.x, y: e.y }, now);
        Effects.explosion({ x: e.x, y: e.y }, now + 0.3, true);
      }
    },

    update: function (now) {
      list = list.filter(function (fx) { return now - fx.t0 < fx.dur; });
    },

    draw: function (ctx, cam, now, shipAt) {
      const scale = MD.Ships.shipScale(cam);
      for (let i = 0; i < list.length; i++) {
        const fx = list[i];
        const p = (now - fx.t0) / fx.dur;
        if (p < 0 || p > 1) continue;
        let s = cam.toScreen(fx);
        if (fx.carrier && shipAt && shipAt[fx.carrier]) s = { x: shipAt[fx.carrier].x + fx.dx, y: shipAt[fx.carrier].y + fx.dy };
        if (fx.ox) s = { x: s.x + fx.ox, y: s.y + fx.oy };
        if (fx.type === 'boom') Effects.drawBoom(ctx, s, p, fx, scale);
        else if (fx.type === 'splash') Effects.drawSplash(ctx, s, p, scale);
        else if (fx.type === 'tracers') Effects.drawTracers(ctx, s, p, fx, now);
        else if (fx.type === 'flak') Effects.drawFlak(ctx, s, now - fx.t0, fx);
        else if (fx.type === 'fall') Effects.drawFall(ctx, s, p, fx);
      }
    },

    drawBoom: function (ctx, s, p, fx, scale) {
      const R = (fx.big ? 18 : 10) * Math.min(scale, 1.6);
      ctx.save();
      const flash = Math.max(0, 1 - p * 2.5);
      if (flash > 0) {
        // A fireball: hot core, orange body, dark-red edge.
        const rad = R * (0.5 + p * 1.8);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
        g.addColorStop(0, 'rgba(255, 236, 180,' + flash * 0.95 + ')');
        g.addColorStop(0.35, 'rgba(255, 150, 50,' + flash * 0.85 + ')');
        g.addColorStop(0.75, 'rgba(190, 50, 20,' + flash * 0.5 + ')');
        g.addColorStop(1, 'rgba(120, 20, 10, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rad, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255, 200, 120,' + (1 - p) + ')';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < fx.parts.length; i++) {
        const d = fx.parts[i];
        const r0 = R * p * 1.6 * d.v;
        const r1 = r0 + 4;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(d.a) * r0, s.y + Math.sin(d.a) * r0);
        ctx.lineTo(s.x + Math.cos(d.a) * r1, s.y + Math.sin(d.a) * r1);
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.fillStyle = 'rgba(25, 20, 18,' + (0.55 * Math.min(1, p * 2) * (1 - p)) + ')';
      ctx.beginPath();
      ctx.arc(s.x - p * 10, s.y - p * 6, R * (0.4 + p), 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    drawSplash: function (ctx, s, p, scale) {
      ctx.save();
      ctx.strokeStyle = 'rgba(235, 248, 255,' + (0.75 * (1 - p)) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (2 + p * 7) * Math.min(scale, 2), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(230, 245, 255,' + (0.45 * (1 - p)) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, (1 + 2 * Math.sin(p * Math.PI)) * Math.min(scale, 2), 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    drawTracers: function (ctx, s, p, fx, now) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < fx.lines.length; i++) {
        const L = fx.lines[i];
        const q = (p * 1.6 + L.start) % 1;
        if (p > 0.92) break;
        const a = L.a + L.spin * q;
        const x = s.x + Math.cos(a) * L.r;
        const y = s.y + Math.sin(a) * L.r * 0.7;
        ctx.strokeStyle = L.warm ? 'rgba(255, 236, 120,' + (1 - q) + ')' : 'rgba(255, 120, 60,' + (1 - q) + ')';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a + 1.4) * L.len, y + Math.sin(a + 1.4) * L.len);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawFlak: function (ctx, s, age, fx) {
      ctx.save();
      for (let i = 0; i < fx.puffs.length; i++) {
        const P = fx.puffs[i];
        const a = age - P.start;
        if (a < 0 || a > 1.6) continue;
        const k = a / 1.6;
        ctx.fillStyle = 'rgba(30, 28, 26,' + (0.6 * (1 - k)) + ')';
        ctx.beginPath();
        ctx.arc(s.x + P.dx, s.y + P.dy, P.r + k * 4, 0, TAU);
        ctx.fill();
        if (a < 0.12) {
          ctx.fillStyle = 'rgba(255, 200, 120, 0.9)';
          ctx.beginPath();
          ctx.arc(s.x + P.dx, s.y + P.dy, 2, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    },

    drawFall: function (ctx, s, p, fx) {
      const x = s.x + fx.dx + fx.drift * p;
      const y = s.y + fx.dy + p * 26;
      ctx.save();
      ctx.strokeStyle = 'rgba(20, 18, 16,' + (0.6 * (1 - p)) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(s.x + fx.dx, s.y + fx.dy);
      ctx.quadraticCurveTo(s.x + fx.dx + fx.drift * p * 0.4, s.y + fx.dy + p * 6, x, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 140, 50,' + (1 - p) + ')';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    /**
     * A burning ship: flicker on the deck, an orange glow on the water, a smoke plume streaming downwind.
     * Stateless (a function of time), so it is the same frame after frame in a screenshot.
     */
    fire: function (ctx, cam, x, y, intensity, now, seed, windFrom, layer, heading) {
      const scale = MD.Ships.shipScale(cam);
      const downwind = ((windFrom + 180) * Math.PI) / 180;
      const wx = Math.sin(downwind);
      const wy = -Math.cos(downwind);
      const plume = 70 * scale * (0.6 + intensity);
      ctx.save();
      const n = layer === 'under' ? Math.round(12 + intensity * 14) : 0;
      for (let i = n - 1; i >= 0; i--) {
        const ph = (now * 0.18 + i / n + seed * 0.37) % 1;
        const wob = Math.sin(ph * 7 + i * 1.7 + seed) * 6 * ph * scale;
        const px = x + wx * plume * ph + -wy * wob;
        const py = y + wy * plume * ph + wx * wob;
        const r = (3 + ph * 18 * (0.5 + intensity)) * scale;
        const dark = 22 + ph * 30;
        ctx.fillStyle = 'rgba(' + dark + ',' + (dark - 4) + ',' + (dark - 6) + ',' + (0.5 * (1 - ph) * (0.5 + intensity * 0.5)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.fill();
      }
      if (layer === 'under') {
        // The glow on the water beneath the hull, kept small so the ship's shape still reads.
        ctx.globalCompositeOperation = 'lighter';
        const glowR = (9 + 7 * intensity) * scale * (0.9 + 0.1 * Math.sin(now * 9 + seed));
        const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        g.addColorStop(0, 'rgba(255, 150, 60,' + (0.45 * intensity + 0.15) + ')');
        g.addColorStop(1, 'rgba(200, 40, 10, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, TAU);
        ctx.fill();
        ctx.restore();
        return;
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glowR = (3 + 3 * intensity) * Math.min(scale, 3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
      g.addColorStop(0, 'rgba(255, 190, 90,' + (0.55 * intensity + 0.2) + ')');
      g.addColorStop(0.5, 'rgba(230, 90, 30,' + (0.3 * intensity + 0.1) + ')');
      g.addColorStop(1, 'rgba(200, 40, 10, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        // Flames licking along the flight deck, along the ship's length.
        const f = Math.sin(now * 11 + i * 2.3 + seed) * 0.5 + 0.5;
        ctx.fillStyle = 'rgba(255, ' + (150 + f * 80) + ', 60, ' + (0.5 + 0.5 * f) * intensity + ')';
        ctx.beginPath();
        const along = (i - 2) * 4 * scale;
        const hr = ((heading || 0) * Math.PI) / 180;
        ctx.arc(x + Math.sin(hr) * along + Math.sin(i * 1.3) * 1.5 * scale, y - Math.cos(hr) * along, (0.8 + f * 1.3) * Math.min(scale, 3), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  };

  MD.Effects = Effects;
})(globalThis.MD = globalThis.MD || {});
