// What the player knows and intends, drawn on the chart: sighting reports (a diamond, its time and an uncertainty
// ring that grows with age), the strike target, a search line being dragged out, a strike being aimed, the course
// being set for the fleet.
(function (MD) {
  'use strict';

  const TAU = Math.PI * 2;

  function diamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  }

  function pad3(n) {
    n = Math.round(MD.Geo.norm360(n));
    return (n < 10 ? '00' : n < 100 ? '0' : '') + n;
  }

  /** The part of the screen not under the side panels: labels are kept inside it. */
  let safe = { x0: 0, x1: 99999 };

  const Markers = {
    setSafeArea: function (cam) {
      safe = { x0: cam.insetLeft + 6, x1: cam.w - cam.insetRight - 6 };
    },

    /** A label's left edge moved so that all of its width stays on the visible chart. */
    clampX: function (x, width) {
      return Math.max(safe.x0, Math.min(safe.x1 - width, x));
    },

    inSafe: function (x) {
      return x >= safe.x0 && x <= safe.x1;
    },

    /** Where a label anchored at x may start, or null when its anchor is off the visible chart (then it is not drawn). */
    labelX: function (x, width) {
      if (x < safe.x0 - 4 || x > safe.x1) return null;
      return Markers.clampX(x, width);
    },

    /** How sure a report still is: its ring grows by the ships' possible run since it was made. */
    reportRadius: function (r, minute) {
      return r.err + (Math.max(0, minute - r.obsT) * Math.max(12, r.speed)) / 60;
    },

    /** Reports fade over three hours; carrier sightings stand out in red. */
    reports: function (ctx, cam, reports, minute, selectedId, clock) {
      for (let i = 0; i < reports.length; i++) {
        const r = reports[i];
        const age = minute - r.obsT;
        const alpha = Math.max(0.18, 1 - age / 200);
        const s = cam.toScreen(r);
        const hot = r.kind === 'carriers';
        const color = r.kind === 'wrecks' ? '200, 200, 200' : hot ? '255, 110, 80' : '240, 200, 110';
        const R = Markers.reportRadius(r, minute) * cam.zoom;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(' + color + ', 0.07)';
        ctx.strokeStyle = 'rgba(' + color + ', 0.6)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, R, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        // Dead-reckoned course arrow.
        const ahead = MD.Geo.advance(r, r.course, Math.max(10, r.speed), 60);
        const a = cam.toScreen(ahead);
        ctx.strokeStyle = 'rgba(' + color + ', 0.8)';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
        const sel = r.id === selectedId;
        const pulse = hot && age < 30 ? 1 + 0.25 * Math.sin(clock * 6) : 1;
        ctx.fillStyle = 'rgba(' + color + ', 0.95)';
        diamond(ctx, s.x, s.y, 6 * pulse);
        ctx.fill();
        ctx.strokeStyle = sel ? '#ffffff' : 'rgba(20, 10, 5, 0.8)';
        ctx.lineWidth = sel ? 2 : 1;
        ctx.stroke();
        ctx.font = (hot ? 'bold ' : '') + '10px Consolas, monospace';
        ctx.fillStyle = 'rgba(' + color + ', 1)';
        const label = MD.Geo.clock(r.obsT).replace(':', '') + (hot ? ' CV×' + r.carriers : r.kind === 'ships' ? ' CA/DD' : r.kind === 'wrecks' ? ' burning' : ' ?');
        const lx = Markers.labelX(s.x + 9, ctx.measureText(label).width);
        if (lx !== null) ctx.fillText(label, lx, s.y - 6);
        ctx.restore();
      }
    },

    /** The crosshair where the next strike will be sent. */
    target: function (ctx, cam, p, clock, label) {
      const s = cam.toScreen(p);
      const r = 13 + Math.sin(clock * 4) * 2;
      ctx.save();
      ctx.strokeStyle = '#ffcf7a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(a) * (r - 5), s.y + Math.sin(a) * (r - 5));
        ctx.lineTo(s.x + Math.cos(a) * (r + 6), s.y + Math.sin(a) * (r + 6));
        ctx.stroke();
      }
      if (label) {
        ctx.font = 'bold 10px Consolas, monospace';
        ctx.fillStyle = '#ffcf7a';
        ctx.fillText(label, s.x + r + 6, s.y + 4);
      }
      ctx.restore();
    },

    /** A strike being aimed: the line from the fleet, the distance, and whether it is within reach. */
    aimLine: function (ctx, cam, from, to, radius, label) {
      const a = cam.toScreen(from);
      const b = cam.toScreen(to);
      const d = MD.Geo.dist(from, to);
      const ok = d <= radius;
      ctx.save();
      ctx.strokeStyle = ok ? 'rgba(255, 207, 122, 0.95)' : 'rgba(255, 90, 70, 0.95)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255, 207, 122, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.x, a.y, radius * cam.zoom, 0, TAU);
      ctx.stroke();
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillStyle = ok ? '#ffcf7a' : '#ff8a70';
      ctx.fillText(Math.round(d) + ' nm' + (ok ? '' : ' — OUT OF RANGE') + (label ? ' · ' + label : ''), b.x + 12, b.y - 10);
      ctx.restore();
    },

    /** A search line being dragged: the dog-leg it would fly and the band of sea it would see. */
    searchPreview: function (ctx, cam, from, bearing, range) {
      const p1 = MD.Geo.polar(bearing, range, from);
      const p2 = MD.Geo.polar(bearing - 90, MD.Data.search.legCross, p1);
      const a = cam.toScreen(from);
      const b = cam.toScreen(p1);
      const c = cam.toScreen(p2);
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(160, 220, 255, 0.16)';
      ctx.lineWidth = MD.Data.search.sightRadius * 2 * cam.zoom;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200, 235, 255, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillStyle = '#cfeaff';
      ctx.fillText('SEARCH ' + pad3(bearing) + '° · ' + Math.round(range) + ' nm', b.x + 10, b.y - 8);
      ctx.restore();
    },

    /** The fleet's new course while it is being dragged. */
    courseLine: function (ctx, cam, from, to) {
      const a = cam.toScreen(from);
      const b = cam.toScreen(to);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 140, 110, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.fillStyle = 'rgba(255, 140, 110, 0.95)';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - Math.cos(ang - 0.4) * 11, b.y - Math.sin(ang - 0.4) * 11);
      ctx.lineTo(b.x - Math.cos(ang + 0.4) * 11, b.y - Math.sin(ang + 0.4) * 11);
      ctx.fill();
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillText('COURSE ' + pad3(MD.Geo.bearing(from, to)) + '°', b.x + 10, b.y + 4);
      ctx.restore();
    },

    /** A gold-ruled label beside a task group. */
    groupLabel: function (ctx, x, y, title, sub, color) {
      ctx.save();
      ctx.font = 'bold 11px Georgia, serif';
      const w = Math.max(ctx.measureText(title).width, sub ? ctx.measureText(sub).width * 0.9 : 0) + 12;
      x = Markers.labelX(x, w);
      if (x === null) {
        ctx.restore();
        return;
      }
      ctx.fillStyle = 'rgba(5, 16, 24, 0.72)';
      ctx.fillRect(x, y - 11, w, sub ? 26 : 15);
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 11, 2, sub ? 26 : 15);
      ctx.fillText(title, x + 6, y);
      if (sub) {
        ctx.font = '9px Consolas, monospace';
        ctx.fillStyle = 'rgba(233, 223, 199, 0.8)';
        ctx.fillText(sub, x + 6, y + 11);
      }
      ctx.restore();
    },
  };

  MD.Markers = Markers;
})(globalThis.MD = globalThis.MD || {});
