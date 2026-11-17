// The title screen's painting: dawn over the North Pacific, the sun on the horizon, its path of light on the swell,
// and Kido Butai in silhouette — four carriers in line ahead, a strike climbing away into the copper sky.
(function (MD) {
  'use strict';

  const TAU = Math.PI * 2;
  let streaks = null;

  function makeStreaks() {
    const rnd = MD.Rng.stream(1942);
    const out = [];
    for (let i = 0; i < 26; i++) {
      out.push({ x: rnd(), y: 0.08 + rnd() * 0.42, w: 0.12 + rnd() * 0.35, h: 3 + rnd() * 9, a: 0.25 + rnd() * 0.5, v: 0.002 + rnd() * 0.006 });
    }
    return out;
  }

  /** A carrier in profile: hull with a sheer line, the long flat deck, the island, planes ranged aft. */
  function carrierProfile(ctx, x, y, len, island, planes, smoke, clock) {
    const h = len * 0.075;
    ctx.save();
    ctx.translate(x, y);
    // Wake and bow wave.
    ctx.strokeStyle = 'rgba(255, 220, 190, 0.35)';
    ctx.lineWidth = Math.max(1, len * 0.006);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-len * 0.52 - i * len * 0.12, h * 0.2 + i * 1.5);
      ctx.lineTo(-len * 0.52 - (i + 1) * len * 0.22, h * 0.25 + i * 2.5);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 235, 215, 0.55)';
    ctx.beginPath();
    ctx.ellipse(len * 0.5, h * 0.25, len * 0.05, h * 0.18, 0, 0, TAU);
    ctx.fill();
    // Hull.
    ctx.fillStyle = '#120d12';
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, -h * 0.55);
    ctx.lineTo(len * 0.47, -h * 0.75);
    ctx.lineTo(len * 0.53, -h * 0.9);
    ctx.lineTo(len * 0.49, h * 0.3);
    ctx.lineTo(-len * 0.46, h * 0.3);
    ctx.closePath();
    ctx.fill();
    // Flight deck on its supports.
    ctx.fillRect(-len * 0.5, -h * 1.25, len * 0.95, h * 0.28);
    for (let i = 0; i < 9; i++) ctx.fillRect(-len * 0.46 + i * len * 0.1, -h * 1.0, len * 0.012, h * 0.45);
    // Island.
    const ix = island * len;
    ctx.fillRect(ix, -h * 2.25, len * 0.05, h * 1.05);
    ctx.fillRect(ix - len * 0.012, -h * 2.6, len * 0.075, h * 0.38);
    ctx.fillRect(ix + len * 0.02, -h * 3.2, len * 0.008, h * 0.6);
    // Funnel smoke trailing aft.
    for (let i = 0; i < 6; i++) {
      const ph = (clock * 0.05 + i / 6) % 1;
      ctx.fillStyle = 'rgba(40, 28, 34,' + (0.16 * (1 - ph)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(ix - ph * len * 0.5, -h * 2.5 - ph * h * 1.2, h * (0.25 + ph * 0.9), h * (0.18 + ph * 0.45), 0, 0, TAU);
      ctx.fill();
    }
    // Planes ranged on deck.
    ctx.fillStyle = '#120d12';
    for (let i = 0; i < planes; i++) {
      const px = -len * 0.45 + i * len * 0.045;
      ctx.fillRect(px, -h * 1.5, len * 0.03, h * 0.26);
      ctx.fillRect(px + len * 0.012, -h * 1.75, len * 0.005, h * 0.3);
    }
    void smoke;
    ctx.restore();
  }

  function planeSil(ctx, x, y, s) {
    ctx.fillStyle = '#1a1018';
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x + s * 0.9, y - s * 0.12);
    ctx.lineTo(x + s, y + s * 0.05);
    ctx.lineTo(x - s * 0.9, y + s * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - s * 0.15, y - s * 0.08, s * 0.35, s * 0.12);
    ctx.fillRect(x - s * 0.95, y - s * 0.35, s * 0.12, s * 0.38);
  }

  const TitleScene = {
    draw: function (ctx, w, h, clock) {
      if (!streaks) streaks = makeStreaks();
      const horizon = h * 0.6;
      const sunX = w * 0.66;
      // Sky.
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#1b2140');
      sky.addColorStop(0.35, '#5a3a5c');
      sky.addColorStop(0.7, '#c46a4a');
      sky.addColorStop(0.92, '#f2b26a');
      sky.addColorStop(1, '#ffd79a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon + 1);
      // Sun and its glow.
      const glow = ctx.createRadialGradient(sunX, horizon, 4, sunX, horizon, w * 0.45);
      glow.addColorStop(0, 'rgba(255, 245, 210, 0.95)');
      glow.addColorStop(0.08, 'rgba(255, 210, 140, 0.7)');
      glow.addColorStop(0.35, 'rgba(255, 150, 80, 0.22)');
      glow.addColorStop(1, 'rgba(255, 120, 60, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, horizon);
      ctx.fillStyle = '#fff3cf';
      ctx.beginPath();
      ctx.arc(sunX, horizon + 2, h * 0.045, Math.PI, TAU);
      ctx.fill();
      // Long clouds lit from beneath.
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];
        const x = (((s.x + clock * s.v) % 1.4) - 0.2) * w;
        const y = s.y * horizon;
        const lightBelow = Math.min(1, y / horizon + 0.2);
        const g = ctx.createLinearGradient(0, y - s.h, 0, y + s.h);
        g.addColorStop(0, 'rgba(70, 40, 70,' + s.a * 0.6 + ')');
        g.addColorStop(1, 'rgba(255,' + Math.round(140 + 60 * lightBelow) + ', 110,' + s.a * lightBelow + ')');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, s.w * w * 0.5, s.h, 0, 0, TAU);
        ctx.fill();
      }
      // Sea.
      const sea = ctx.createLinearGradient(0, horizon, 0, h);
      sea.addColorStop(0, '#5a4a5a');
      sea.addColorStop(0.08, '#2c3346');
      sea.addColorStop(0.5, '#122436');
      sea.addColorStop(1, '#07131e');
      ctx.fillStyle = sea;
      ctx.fillRect(0, horizon, w, h - horizon);
      // The sun's path of light on the swell.
      const rnd = MD.Rng.stream(77);
      for (let i = 0; i < 420; i++) {
        const depth = rnd();
        const y = horizon + 2 + depth * depth * (h - horizon);
        const spreadX = 20 + depth * w * 0.22;
        const x = sunX + (rnd() - 0.5) * 2 * spreadX + Math.sin(clock * 1.3 + i) * 3;
        const tw = 0.5 + 0.5 * Math.sin(clock * (2 + rnd() * 3) + i * 1.7);
        const len = 4 + depth * 26 * rnd();
        ctx.fillStyle = 'rgba(255, ' + Math.round(200 + 40 * rnd()) + ', 150,' + (0.08 + 0.55 * tw * (1 - depth * 0.6)) + ')';
        ctx.fillRect(x - len / 2, y, len, 1 + depth * 1.5);
      }
      // Swell lines across the whole sea.
      ctx.strokeStyle = 'rgba(150, 120, 140, 0.12)';
      for (let i = 0; i < 40; i++) {
        const y = horizon + 6 + Math.pow(i / 40, 1.8) * (h - horizon);
        ctx.lineWidth = 0.5 + (i / 40) * 1.5;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 24) {
          const yy = y + Math.sin(x * 0.01 + clock * 0.6 + i) * (1 + i * 0.08);
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // Escorts on the horizon and the four carriers in line ahead.
      ctx.fillStyle = '#20151d';
      for (let i = 0; i < 7; i++) {
        const ex = w * (0.06 + i * 0.13);
        ctx.fillRect(ex, horizon - 3, w * 0.03, 3);
        ctx.fillRect(ex + w * 0.012, horizon - 6, w * 0.004, 3);
      }
      const roll = Math.sin(clock * 0.8) * 0.6;
      carrierProfile(ctx, w * 0.22, horizon + h * 0.02 + roll * 0.3, w * 0.14, 0.12, 6, 0, clock);
      carrierProfile(ctx, w * 0.43, horizon + h * 0.035 + roll * 0.5, w * 0.18, -0.12, 8, 0, clock);
      carrierProfile(ctx, w * 0.12, horizon + h * 0.07 + roll, w * 0.24, 0.15, 10, 0, clock);
      carrierProfile(ctx, w * 0.82, horizon + h * 0.1 + roll * 1.3, w * 0.33, -0.1, 12, 0, clock);
      // A strike climbing away toward the east.
      for (let i = 0; i < 9; i++) {
        const row = Math.floor((i + 1) / 2);
        const side = i === 0 ? 0 : i % 2 ? -1 : 1;
        // Low over the eastern horizon, clear of the title lettering.
        const bx = w * 0.56 + ((clock * 9) % (w * 0.36));
        planeSil(ctx, bx - row * 26, h * 0.47 - row * 5 + side * row * 9 + Math.sin(clock + i) * 1.5, 7);
      }
      // Film grain and vignette for the painted look.
      const v = ctx.createRadialGradient(w * 0.5, h * 0.55, h * 0.3, w * 0.5, h * 0.55, w * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    },
  };

  MD.TitleScene = TitleScene;
})(globalThis.MD = globalThis.MD || {});
