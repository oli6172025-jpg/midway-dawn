// The sea and the chart drawn on it: the water with slowly moving swell, latitude and longitude lines,
// range rings around Midway, the atoll itself, a compass rose and a scale bar.
(function (MD) {
  'use strict';

  const MIDWAY_LAT = 28.21;
  const MIDWAY_LONW = 177.37;
  const NM_PER_LON = 60 * Math.cos((MIDWAY_LAT * Math.PI) / 180);

  let swell = null;
  let glints = null;

  /** A tileable texture of wave crests: short bright arcs scattered over transparent water. */
  function makeSwell(size, seed, count, alpha) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const rnd = MD.Rng.stream(seed);
    g.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const len = 6 + rnd() * 22;
      const bend = (rnd() - 0.5) * 6;
      const a = alpha * (0.35 + rnd() * 0.65);
      g.strokeStyle = 'rgba(190, 225, 240,' + a.toFixed(3) + ')';
      g.lineWidth = 0.6 + rnd() * 1.1;
      for (let ox = -size; ox <= size; ox += size) {
        for (let oy = -size; oy <= size; oy += size) {
          if (x + ox + len < 0 || x + ox - len > size || y + oy + 6 < 0 || y + oy - 6 > size) continue;
          g.beginPath();
          g.moveTo(x + ox - len / 2, y + oy);
          g.quadraticCurveTo(x + ox, y + oy + bend, x + ox + len / 2, y + oy);
          g.stroke();
        }
      }
    }
    return c;
  }

  function latLabel(lat) {
    return Math.abs(lat).toFixed(0) + '°' + (lat >= 0 ? 'N' : 'S');
  }
  function lonLabel(lonW) {
    if (lonW > 180) return (360 - lonW).toFixed(0) + '°E';
    return lonW.toFixed(0) + '°' + (lonW === 180 ? '' : 'W');
  }

  const Sea = {
    init: function () {
      swell = makeSwell(384, 7, 420, 0.22);
      glints = makeSwell(256, 99, 160, 0.4);
    },

    /** Water: the day's colours with two layers of swell drifting at different speeds. */
    drawWater: function (ctx, cam, minute, clock) {
      const light = MD.Palette.lightAt(minute);
      const grad = ctx.createLinearGradient(0, 0, 0, cam.h);
      grad.addColorStop(0, MD.Palette.rgb(light.top));
      grad.addColorStop(1, MD.Palette.rgb(light.bottom));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cam.w, cam.h);
      if (!swell) Sea.init();
      // Large, slow variations of colour: the sea is never flat.
      const blot = ctx.createRadialGradient(cam.w * 0.35, cam.h * 0.4, 20, cam.w * 0.35, cam.h * 0.4, cam.w * 0.7);
      blot.addColorStop(0, 'rgba(40, 110, 130, 0.18)');
      blot.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = blot;
      ctx.fillRect(0, 0, cam.w, cam.h);
      const layers = [
        { img: swell, scale: 1, drift: 7, alpha: 0.75 },
        { img: glints, scale: 0.7, drift: -11, alpha: 0.45 },
      ];
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i];
        const pat = ctx.createPattern(L.img, 'repeat');
        const size = L.img.width * L.scale;
        const ox = ((-cam.x * cam.zoom * 0.6 + clock * L.drift) % size + size) % size;
        const oy = ((cam.y * cam.zoom * 0.6 + clock * L.drift * 0.35) % size + size) % size;
        ctx.save();
        ctx.globalAlpha = L.alpha * (0.6 + 0.4 * Math.sin(clock * 0.4 + i * 2.1));
        ctx.translate(ox - size, oy - size);
        ctx.scale(L.scale, L.scale);
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, (cam.w + size * 2) / L.scale, (cam.h + size * 2) / L.scale);
        ctx.restore();
      }
    },

    /** Latitude / longitude every degree, labelled at the chart's edges. */
    drawGrid: function (ctx, cam) {
      const b = cam.bounds(0);
      ctx.save();
      ctx.lineWidth = 1;
      ctx.font = '10px Consolas, monospace';
      ctx.fillStyle = 'rgba(201, 164, 92, 0.55)';
      const latMin = Math.floor(MIDWAY_LAT + b.y0 / 60);
      const latMax = Math.ceil(MIDWAY_LAT + b.y1 / 60);
      for (let lat = latMin; lat <= latMax; lat++) {
        const y = cam.sy((lat - MIDWAY_LAT) * 60);
        ctx.strokeStyle = MD.Palette.grid;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cam.w, y);
        ctx.stroke();
        ctx.fillText(latLabel(lat), cam.insetLeft + 6, y - 3);
      }
      const lonMin = Math.floor(MIDWAY_LONW - b.x1 / NM_PER_LON);
      const lonMax = Math.ceil(MIDWAY_LONW - b.x0 / NM_PER_LON);
      for (let lon = lonMin; lon <= lonMax; lon++) {
        const x = cam.sx((MIDWAY_LONW - lon) * NM_PER_LON);
        ctx.strokeStyle = lon === 180 ? MD.Palette.gridStrong : MD.Palette.grid;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cam.h);
        ctx.stroke();
        ctx.fillText(lonLabel(lon), x + 3, cam.h - 8);
      }
      ctx.restore();
    },

    /** Dashed range rings every 100 nm from Midway. */
    drawRings: function (ctx, cam) {
      const o = cam.toScreen({ x: 0, y: 0 });
      ctx.save();
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(233, 223, 199, 0.16)';
      ctx.fillStyle = 'rgba(233, 223, 199, 0.32)';
      ctx.font = 'italic 10px Georgia, serif';
      for (let r = 100; r <= 400; r += 100) {
        ctx.beginPath();
        ctx.arc(o.x, o.y, r * cam.zoom, 0, Math.PI * 2);
        ctx.stroke();
        const p = cam.toScreen(MD.Geo.polar(315, r));
        ctx.fillText(r + ' nm', p.x + 3, p.y - 3);
      }
      ctx.restore();
    },

    /** Midway Atoll: the reef ring, the lagoon, Sand and Eastern islands; smoke when the airfield burns. */
    drawMidway: function (ctx, cam, hp, clock) {
      const o = cam.toScreen({ x: 0, y: 0 });
      const r = Math.max(7, 3 * cam.zoom);
      ctx.save();
      ctx.fillStyle = 'rgba(120, 220, 210, 0.35)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230, 250, 240, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#e8d9a8';
      ctx.beginPath();
      ctx.ellipse(o.x - r * 0.35, o.y + r * 0.35, r * 0.38, r * 0.22, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(o.x + r * 0.35, o.y + r * 0.42, r * 0.26, r * 0.15, 0.2, 0, Math.PI * 2);
      ctx.fill();
      if (hp < 70) {
        const n = hp <= 0 ? 7 : hp < 40 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const ph = (clock * 0.25 + i / n) % 1;
          ctx.fillStyle = 'rgba(30, 26, 24,' + (0.45 * (1 - ph)).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(o.x - ph * 40 + i * 2, o.y - ph * 18 - 4, 4 + ph * 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.font = 'bold 11px Georgia, serif';
      ctx.fillStyle = hp <= 0 ? '#ff9d86' : MD.Palette.usLight;
      ctx.textAlign = 'center';
      ctx.fillText('MIDWAY', o.x, o.y + r + 13);
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = 'rgba(207, 230, 255, 0.7)';
      ctx.fillText(hp <= 0 ? 'AIRFIELD IN RUINS' : 'airfield ' + Math.round(hp) + '%', o.x, o.y + r + 23);
      ctx.restore();
    },

    /** The compass rose and a scale bar, fixed to the bottom-left of the chart. */
    drawCompass: function (ctx, cam) {
      const cx = cam.insetLeft + 66;
      const cy = cam.h - 72;
      const R = 42;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = 'rgba(201, 164, 92, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, R - 6, 0, Math.PI * 2);
      ctx.stroke();
      for (let d = 0; d < 360; d += 10) {
        const a = (d * Math.PI) / 180;
        const inner = d % 90 === 0 ? R - 10 : d % 30 === 0 ? R - 6 : R - 4;
        ctx.beginPath();
        ctx.moveTo(Math.sin(a) * inner, -Math.cos(a) * inner);
        ctx.lineTo(Math.sin(a) * R, -Math.cos(a) * R);
        ctx.stroke();
      }
      const star = function (len, wid, rot, light, dark) {
        for (let k = 0; k < 4; k++) {
          const a = rot + (k * Math.PI) / 2;
          ctx.save();
          ctx.rotate(a);
          ctx.fillStyle = light;
          ctx.beginPath();
          ctx.moveTo(0, -len);
          ctx.lineTo(wid, 0);
          ctx.lineTo(0, 0);
          ctx.fill();
          ctx.fillStyle = dark;
          ctx.beginPath();
          ctx.moveTo(0, -len);
          ctx.lineTo(-wid, 0);
          ctx.lineTo(0, 0);
          ctx.fill();
          ctx.restore();
        }
      };
      star(R - 14, 5, Math.PI / 4, 'rgba(201, 164, 92, 0.5)', 'rgba(120, 95, 50, 0.5)');
      star(R - 2, 7, 0, 'rgba(233, 223, 199, 0.85)', 'rgba(150, 125, 80, 0.85)');
      ctx.fillStyle = MD.Palette.jp;
      ctx.beginPath();
      ctx.moveTo(0, -R + 2);
      ctx.lineTo(4, -R + 14);
      ctx.lineTo(-4, -R + 14);
      ctx.fill();
      ctx.font = 'bold 11px Georgia, serif';
      ctx.fillStyle = MD.Palette.paper;
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -R - 5);
      ctx.restore();
      // Scale bar: the largest round distance that fits in about 120 px.
      const steps = [10, 25, 50, 100, 200];
      let nm = steps[0];
      for (let i = 0; i < steps.length; i++) if (steps[i] * cam.zoom <= 130) nm = steps[i];
      const len = nm * cam.zoom;
      const x0 = cx + R + 22;
      const y0 = cy + R - 4;
      ctx.save();
      ctx.strokeStyle = 'rgba(233, 223, 199, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0 - 4);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x0 + len, y0);
      ctx.lineTo(x0 + len, y0 - 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(233, 223, 199, 0.8)';
      ctx.font = '10px Consolas, monospace';
      ctx.fillText(nm + ' nm', x0 + len / 2 - 14, y0 - 6);
      ctx.restore();
    },

    /** The day's tint and a soft vignette over everything on the chart. */
    drawLight: function (ctx, cam, minute) {
      const light = MD.Palette.lightAt(minute);
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = MD.Palette.rgb(light.tint, Math.min(0.9, light.tint[3] * 2.2));
      ctx.fillRect(0, 0, cam.w, cam.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = MD.Palette.rgb(light.tint, light.tint[3] * 0.6);
      ctx.fillRect(0, 0, cam.w, cam.h);
      const v = ctx.createRadialGradient(cam.w / 2, cam.h / 2, cam.h * 0.35, cam.w / 2, cam.h / 2, cam.w * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, cam.w, cam.h);
      ctx.restore();
    },
  };

  MD.Sea = Sea;
})(globalThis.MD = globalThis.MD || {});
