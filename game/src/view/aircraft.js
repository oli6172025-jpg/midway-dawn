// Aircraft on the chart: small plane silhouettes in V formations, the dashed track behind each flight,
// a label with its name and strength, and the lonely single plane of a search line.
(function (MD) {
  'use strict';

  const DEG = Math.PI / 180;

  /** One plane, nose toward -y before rotation. */
  function plane(ctx, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.16, -size * 0.35);
    ctx.lineTo(size, -size * 0.1);
    ctx.lineTo(size, size * 0.12);
    ctx.lineTo(size * 0.16, size * 0.05);
    ctx.lineTo(size * 0.12, size * 0.62);
    ctx.lineTo(size * 0.42, size * 0.78);
    ctx.lineTo(size * 0.42, size * 0.92);
    ctx.lineTo(0, size * 0.85);
    ctx.lineTo(-size * 0.42, size * 0.92);
    ctx.lineTo(-size * 0.42, size * 0.78);
    ctx.lineTo(-size * 0.12, size * 0.62);
    ctx.lineTo(-size * 0.16, size * 0.05);
    ctx.lineTo(-size, size * 0.12);
    ctx.lineTo(-size, -size * 0.1);
    ctx.lineTo(-size * 0.16, -size * 0.35);
    ctx.closePath();
    ctx.fill();
  }

  const Aircraft = {
    plane: plane,

    /** The way a flight has come, as a dashed line fading into the past. */
    track: function (ctx, cam, f, color, alpha) {
      const pts = f.path;
      if (!pts || pts.length < 2) return;
      ctx.save();
      ctx.lineWidth = f.kind === 'scout' ? 1 : 1.6;
      ctx.setLineDash(f.kind === 'scout' ? [1, 4] : [6, 5]);
      const start = Math.max(0, pts.length - 80);
      for (let i = start + 1; i < pts.length; i++) {
        const a = cam.toScreen(pts[i - 1]);
        const b = cam.toScreen(pts[i]);
        ctx.globalAlpha = alpha * (0.15 + (0.85 * (i - start)) / (pts.length - start));
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      const last = cam.toScreen(pts[pts.length - 1]);
      const now = cam.toScreen(f);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(now.x, now.y);
      ctx.stroke();
      ctx.restore();
    },

    /** A strike: V formations of planes, one icon for about every six aircraft. */
    formation: function (ctx, x, y, heading, count, color, clock, scale) {
      const icons = Math.max(1, Math.min(12, Math.ceil(count / 6)));
      const size = 4.2 * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading * DEG);
      const bob = Math.sin(clock * 3) * 0.6;
      for (let i = 0; i < icons; i++) {
        const row = Math.floor((i + 1) / 2);
        const sideSign = i === 0 ? 0 : i % 2 === 1 ? -1 : 1;
        const px = sideSign * row * size * 2.3;
        const py = row * size * 1.9 + (i % 3 === 0 ? bob : -bob);
        ctx.save();
        ctx.translate(px + 1.2, py + 1.5);
        plane(ctx, size, 'rgba(0, 8, 14, 0.4)');
        ctx.restore();
        ctx.save();
        ctx.translate(px, py);
        plane(ctx, size, color);
        ctx.restore();
      }
      ctx.restore();
    },

    /** "1st Strike · 98" under a flight. */
    label: function (ctx, x, y, text, color) {
      ctx.save();
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'center';
      const w = ctx.measureText(text).width + 8;
      const left = MD.Markers.labelX(x - w / 2, w);
      if (left === null) {
        ctx.restore();
        return;
      }
      x = left + w / 2;
      ctx.fillStyle = 'rgba(5, 16, 24, 0.7)';
      ctx.fillRect(x - w / 2, y - 9, w, 13);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y + 1);
      ctx.restore();
    },

    /** A search plane's planned dog-leg, faint, so the player sees the line it will fly. */
    route: function (ctx, cam, f, color) {
      if (!f.route) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const p = cam.toScreen(f);
      ctx.moveTo(p.x, p.y);
      for (let i = f.leg; i < f.route.length; i++) {
        const q = cam.toScreen(f.route[i]);
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      ctx.restore();
    },
  };

  MD.Aircraft = Aircraft;
})(globalThis.MD = globalThis.MD || {});
