// Sea geometry: Midway Atoll is the origin, x is nautical miles east, y nautical miles north.
// Bearings are compass degrees, 0 = north, clockwise. Time is in game minutes from 04:30.
(function (MD) {
  'use strict';

  const DEG = Math.PI / 180;

  const Geo = {
    /** The point `dist` nm from the origin (or from `from`) on compass bearing `deg`. */
    polar: function (deg, dist, from) {
      const ox = from ? from.x : 0;
      const oy = from ? from.y : 0;
      return { x: ox + Math.sin(deg * DEG) * dist, y: oy + Math.cos(deg * DEG) * dist };
    },
    dist: function (a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return Math.sqrt(dx * dx + dy * dy);
    },
    /** Compass bearing from a to b, 0..360. */
    bearing: function (a, b) {
      const deg = Math.atan2(b.x - a.x, b.y - a.y) / DEG;
      return (deg + 360) % 360;
    },
    /** Move a point toward a compass heading at `knots` for one minute. */
    advance: function (p, headingDeg, knots, minutes) {
      const d = (knots / 60) * (minutes || 1);
      return { x: p.x + Math.sin(headingDeg * DEG) * d, y: p.y + Math.cos(headingDeg * DEG) * d };
    },
    /** Move `p` up to `maxStep` nm straight toward `target`; returns the new point and whether it arrived. */
    stepToward: function (p, target, maxStep) {
      const d = Geo.dist(p, target);
      if (d <= maxStep || d < 1e-6) return { x: target.x, y: target.y, arrived: true };
      const k = maxStep / d;
      return { x: p.x + (target.x - p.x) * k, y: p.y + (target.y - p.y) * k, arrived: false };
    },
    /** Signed smallest difference b - a between two headings, -180..180. */
    turn: function (a, b) {
      return ((b - a + 540) % 360) - 180;
    },
    norm360: function (deg) {
      return ((deg % 360) + 360) % 360;
    },
    /** "04:30" style clock text for a game minute (minute 0 is 04:30). */
    clock: function (minute) {
      const total = 4 * 60 + 30 + Math.floor(minute);
      const h = Math.floor(total / 60) % 24;
      const m = total % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },
    /** A game minute for a clock time given as hours and minutes. */
    minuteOf: function (h, m) {
      return h * 60 + m - (4 * 60 + 30);
    },
    /** Bearing and range from Midway, as a navigator writes it: "318° / 240 nm". */
    fix: function (p) {
      const b = Math.round(Geo.bearing({ x: 0, y: 0 }, p));
      const r = Math.round(Geo.dist({ x: 0, y: 0 }, p));
      return (b < 100 ? (b < 10 ? '00' : '0') : '') + b + '° / ' + r + ' nm';
    },
  };

  MD.Geo = Geo;
})(globalThis.MD = globalThis.MD || {});
