// The chart's colours, and the light of the day: copper at dawn, clear blue at noon, violet-gold at dusk.
(function (MD) {
  'use strict';

  const Palette = {
    sea: '#0b2233',
    sea2: '#12374a',
    paper: '#e9dfc7',
    jp: '#c8402f',
    jpLight: '#ff7a5c',
    us: '#6fa8dc',
    usLight: '#cfe6ff',
    gold: '#c9a45c',
    grid: 'rgba(201, 164, 92, 0.16)',
    gridStrong: 'rgba(201, 164, 92, 0.34)',

    /** Key frames of the light: [minute, tint rgba, sea top, sea bottom]. */
    light: [
      [0, [150, 80, 70, 0.32], [16, 34, 52], [8, 20, 32]],
      [25, [214, 120, 64, 0.24], [22, 52, 70], [10, 30, 44]],
      [90, [230, 170, 110, 0.1], [20, 64, 84], [11, 36, 52]],
      [300, [140, 200, 255, 0.04], [18, 70, 94], [11, 40, 58]],
      [570, [150, 205, 255, 0.04], [18, 68, 92], [11, 38, 56]],
      [760, [230, 150, 80, 0.14], [24, 56, 76], [12, 32, 48]],
      [820, [190, 90, 120, 0.24], [26, 42, 66], [12, 22, 40]],
      [860, [90, 60, 120, 0.32], [16, 26, 48], [8, 14, 30]],
    ],

    /** Interpolated light for a game minute: { tint: [r,g,b,a], top, bottom }. */
    lightAt: function (minute) {
      const L = Palette.light;
      let i = 0;
      while (i < L.length - 2 && L[i + 1][0] <= minute) i++;
      const a = L[i];
      const b = L[i + 1];
      const k = Math.max(0, Math.min(1, (minute - a[0]) / (b[0] - a[0])));
      const mix = function (p, q) {
        const out = [];
        for (let j = 0; j < p.length; j++) out.push(p[j] + (q[j] - p[j]) * k);
        return out;
      };
      return { tint: mix(a[1], b[1]), top: mix(a[2], b[2]), bottom: mix(a[3], b[3]) };
    },

    rgb: function (c, alpha) {
      return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (alpha === undefined ? (c[3] === undefined ? 1 : c[3]) : alpha) + ')';
    },

    /** What the sky is doing, for the clock's caption. */
    phaseName: function (minute) {
      if (minute < 25) return 'Before dawn';
      if (minute < 90) return 'Dawn';
      if (minute < 420) return 'Morning';
      if (minute < 600) return 'Afternoon';
      if (minute < 815) return 'Evening';
      return 'Sunset';
    },

    side: function (side) {
      return side === 'J' ? Palette.jp : Palette.us;
    },
  };

  MD.Palette = Palette;
})(globalThis.MD = globalThis.MD || {});
