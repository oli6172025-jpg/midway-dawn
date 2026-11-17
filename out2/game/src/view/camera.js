// The chart's camera: nautical miles (x east, y north) to screen pixels and back, with smooth pans and zooms.
// The visible chart is the space between the fleet panel and the signals panel, so "centre" means its middle.
(function (MD) {
  'use strict';

  function Camera() {
    this.x = -60;
    this.y = 140;
    this.zoom = 1.25;
    this.goal = null;
    this.w = 1280;
    this.h = 720;
    this.insetLeft = 302;
    this.insetRight = 280;
    this.insetTop = 48;
  }

  Camera.prototype.resize = function (w, h, panels) {
    this.w = w;
    this.h = h;
    this.insetLeft = panels ? 302 : 0;
    this.insetRight = panels ? 280 : 0;
    this.insetTop = panels ? 48 : 0;
  };

  Camera.prototype.cx = function () {
    return (this.insetLeft + (this.w - this.insetRight)) / 2;
  };
  Camera.prototype.cy = function () {
    return (this.insetTop + this.h) / 2;
  };

  Camera.prototype.toScreen = function (p) {
    return { x: this.cx() + (p.x - this.x) * this.zoom, y: this.cy() - (p.y - this.y) * this.zoom };
  };
  Camera.prototype.sx = function (x) {
    return this.cx() + (x - this.x) * this.zoom;
  };
  Camera.prototype.sy = function (y) {
    return this.cy() - (y - this.y) * this.zoom;
  };
  Camera.prototype.toWorld = function (sx, sy) {
    return { x: this.x + (sx - this.cx()) / this.zoom, y: this.y - (sy - this.cy()) / this.zoom };
  };

  /** Glide to a point (and optionally a zoom) over the next half second. */
  Camera.prototype.flyTo = function (p, zoom) {
    this.goal = { x: p.x, y: p.y, zoom: zoom || this.zoom };
  };

  Camera.prototype.jump = function (p, zoom) {
    this.goal = null;
    this.x = p.x;
    this.y = p.y;
    if (zoom) this.zoom = zoom;
  };

  Camera.prototype.panBy = function (dxPx, dyPx) {
    this.goal = null;
    this.x -= dxPx / this.zoom;
    this.y += dyPx / this.zoom;
    this.clamp();
  };

  /** Zoom about a screen point, keeping the world point under it fixed. */
  Camera.prototype.zoomAt = function (sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.max(0.55, Math.min(14, this.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.goal = null;
    this.clamp();
  };

  Camera.prototype.clamp = function () {
    const lim = MD.Data.MAP_RADIUS + 80;
    this.x = Math.max(-lim, Math.min(lim, this.x));
    this.y = Math.max(-lim, Math.min(lim, this.y));
  };

  Camera.prototype.update = function (dt) {
    if (!this.goal) return;
    const k = 1 - Math.pow(0.0025, dt);
    this.x += (this.goal.x - this.x) * k;
    this.y += (this.goal.y - this.y) * k;
    this.zoom += (this.goal.zoom - this.zoom) * k;
    if (Math.abs(this.goal.x - this.x) < 0.05 && Math.abs(this.goal.y - this.y) < 0.05 && Math.abs(this.goal.zoom - this.zoom) < 0.002) this.goal = null;
  };

  /** World rectangle currently on screen (with a margin), for culling. */
  Camera.prototype.bounds = function (marginPx) {
    const m = marginPx || 0;
    const a = this.toWorld(-m, -m);
    const b = this.toWorld(this.w + m, this.h + m);
    return { x0: a.x, x1: b.x, y0: b.y, y1: a.y };
  };

  MD.Camera = Camera;
})(globalThis.MD = globalThis.MD || {});
