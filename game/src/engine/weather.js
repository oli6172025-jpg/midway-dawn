// Weather fronts: two or three long cloud bands drifting across the battle area, each broken by holes.
// cloudAt() is a pure function of (fronts, x, y, minute), so the simulation and the renderer agree on
// exactly where the clouds are. Under cloud, search planes see less and strikes find less.
(function (MD) {
  'use strict';

  const DEG = Math.PI / 180;

  /** A fast integer lattice hash in [0, 1), for value noise. */
  function lattice(ix, iy, seed) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  /** Smooth 2D value noise in [0, 1). */
  function valueNoise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = lattice(ix, iy, seed);
    const b = lattice(ix + 1, iy, seed);
    const c = lattice(ix, iy + 1, seed);
    const d = lattice(ix + 1, iy + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /** Two octaves of value noise, normalised to roughly [0, 1). */
  function fbm(x, y, seed) {
    return (valueNoise(x, y, seed) * 0.66 + valueNoise(x * 2.3 + 17.1, y * 2.3 - 9.4, seed + 101) * 0.34);
  }

  function edge(lo, hi, v) {
    if (v <= lo) return 0;
    if (v >= hi) return 1;
    return smooth((v - lo) / (hi - lo));
  }

  const Weather = {
    valueNoise: valueNoise,
    fbm: fbm,

    /** 2 or 3 fronts for this seed: width 80-160 nm, drifting 5-15 kt, 20-40% holes. */
    createFronts: function (state) {
      const R = MD.Rng;
      const count = R.chance(state, 'wx:count', 0.5) ? 3 : 2;
      const fronts = [];
      for (let i = 0; i < count; i++) {
        const k = 'wx:' + i + ':';
        const axis = R.range(state, k + 'axis', 20, 160); // the band's long axis, compass degrees
        const drift = axis + (R.chance(state, k + 'side', 0.5) ? 90 : -90);
        const kt = R.range(state, k + 'kt', 5, 15);
        const centre = MD.Geo.polar(R.range(state, k + 'cb', 0, 360), R.range(state, k + 'cr', 40, 300));
        fronts.push({
          cx: centre.x,
          cy: centre.y,
          axis: axis,
          halfWidth: R.range(state, k + 'w', 80, 160) / 2,
          halfLength: R.range(state, k + 'l', 380, 620),
          vx: Math.sin(drift * DEG) * kt,
          vy: Math.cos(drift * DEG) * kt,
          holes: R.range(state, k + 'holes', 0.2, 0.4),
          noise: (R.u(state, k + 'noise') * 100000) | 0,
        });
      }
      return fronts;
    },

    /** Cloud cover 0..1 at a sea point and minute. */
    cloudAt: function (fronts, x, y, minute) {
      let best = 0;
      const hours = minute / 60;
      for (let i = 0; i < fronts.length; i++) {
        const f = fronts[i];
        const dx = x - (f.cx + f.vx * hours);
        const dy = y - (f.cy + f.vy * hours);
        const ax = Math.sin(f.axis * DEG);
        const ay = Math.cos(f.axis * DEG);
        const along = dx * ax + dy * ay;
        const across = -dx * ay + dy * ax;
        const body = (1 - edge(0.55, 1, Math.abs(across) / f.halfWidth)) * (1 - edge(0.75, 1, Math.abs(along) / f.halfLength));
        if (body <= 0) continue;
        // Holes ride with the front: sample the noise in the front's own frame.
        const n = fbm((along + 1000) / 38, (across + 1000) / 38, f.noise);
        const density = body * edge(f.holes - 0.08, f.holes + 0.12, n);
        if (density > best) best = density;
      }
      return best;
    },

    /** How well things are seen from the air here: 1 in clear sky, 0.4 under solid cloud. */
    visibility: function (state, x, y) {
      return 1 - 0.6 * Weather.cloudAt(state.fronts, x, y, state.t);
    },
  };

  MD.Weather = Weather;
})(globalThis.MD = globalThis.MD || {});
