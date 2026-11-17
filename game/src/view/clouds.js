// Cloud fronts on the chart: the simulation's own cloud field (MD.Weather.cloudAt), sampled on a coarse grid,
// shaded, upscaled smoothly, and drawn twice: a dark shadow on the sea, then the cloud tops lit by the day.
(function (MD) {
  'use strict';

  const CELL = 6;
  let buf = null;
  let shade = null;
  let softTops = null;
  let softShade = null;
  let last = { key: '' };

  function ensure(w, h) {
    const cw = Math.ceil(w / CELL) + 1;
    const ch = Math.ceil(h / CELL) + 1;
    if (!buf || buf.width !== cw || buf.height !== ch) {
      buf = document.createElement('canvas');
      buf.width = cw;
      buf.height = ch;
      shade = document.createElement('canvas');
      shade.width = cw;
      shade.height = ch;
      last.key = '';
    }
  }

  const Clouds = {
    /** Re-samples the cloud field when the view or the hour changed enough to show. */
    update: function (cam, fronts, minute) {
      ensure(cam.w, cam.h);
      const key = [Math.round(cam.x * 4), Math.round(cam.y * 4), Math.round(cam.zoom * 200), Math.floor(minute / 3), cam.w, cam.h].join(',');
      if (key === last.key) return;
      last.key = key;
      const g = buf.getContext('2d');
      const img = g.createImageData(buf.width, buf.height);
      const sg = shade.getContext('2d');
      const simg = sg.createImageData(buf.width, buf.height);
      const light = MD.Palette.lightAt(minute);
      const warm = light.tint;
      const d = img.data;
      const s = simg.data;
      for (let j = 0; j < buf.height; j++) {
        for (let i = 0; i < buf.width; i++) {
          const w = cam.toWorld(i * CELL, j * CELL);
          let c = MD.Weather.cloudAt(fronts, w.x, w.y, minute);
          const o = (j * buf.width + i) * 4;
          if (c <= 0.01) {
            d[o + 3] = 0;
            s[o + 3] = 0;
            continue;
          }
          // Billows: finer noise in world space gives the tops their texture.
          const detail = MD.Weather.fbm(w.x / 7, w.y / 7, 4242);
          const clump = Math.max(0, Math.min(1, (detail - 0.32) / 0.3));
          c = Math.min(1, c * clump);
          if (c <= 0.01) {
            d[o + 3] = 0;
            s[o + 3] = 0;
            continue;
          }
          const lit = 0.8 + 0.2 * detail;
          d[o] = Math.min(255, 228 * lit + warm[0] * 0.12);
          d[o + 1] = Math.min(255, 232 * lit + warm[1] * 0.08);
          d[o + 2] = Math.min(255, 238 * lit + warm[2] * 0.05);
          d[o + 3] = Math.round(255 * Math.min(0.5, c * 0.55));
          s[o] = 2;
          s[o + 1] = 10;
          s[o + 2] = 16;
          s[o + 3] = Math.round(255 * Math.min(0.3, c * 0.32));
        }
      }
      g.putImageData(img, 0, 0);
      sg.putImageData(simg, 0, 0);
      softTops = Clouds.soften(buf, softTops, cam, 5);
      softShade = Clouds.soften(shade, softShade, cam, 7);
    },

    /** Upscales a coarse field to half the screen through a blur, once per update, so cloud edges are soft. */
    soften: function (src, dst, cam, blur) {
      const w = Math.ceil(cam.w / 2);
      const h = Math.ceil(cam.h / 2);
      if (!dst || dst.width !== w || dst.height !== h) {
        dst = document.createElement('canvas');
        dst.width = w;
        dst.height = h;
      }
      const g = dst.getContext('2d');
      g.clearRect(0, 0, w, h);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.filter = 'blur(' + blur + 'px)';
      g.drawImage(src, 0, 0, src.width, src.height, 0, 0, (src.width * CELL) / 2, (src.height * CELL) / 2);
      g.filter = 'none';
      return dst;
    },

    /** Below the cloud base when zoomed in close: the layer thins so the action stays visible. */
    layerAlpha: function (cam) {
      return Math.max(0.3, Math.min(1, 1.9 / cam.zoom));
    },

    drawShadow: function (ctx, cam) {
      if (!softShade) return;
      ctx.save();
      ctx.globalAlpha = Clouds.layerAlpha(cam);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(softShade, 16, 12, softShade.width * 2, softShade.height * 2);
      ctx.restore();
    },

    drawTops: function (ctx, cam) {
      if (!softTops) return;
      ctx.save();
      ctx.globalAlpha = Clouds.layerAlpha(cam);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(softTops, 0, 0, softTops.width * 2, softTops.height * 2);
      ctx.restore();
    },
  };

  MD.Clouds = Clouds;
})(globalThis.MD = globalThis.MD || {});
