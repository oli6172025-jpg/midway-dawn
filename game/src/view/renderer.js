// Composes one frame of the chart from the battle state: sea, cloud shadows, grid, Midway, tracks, reports,
// ships and their fires, cloud tops, aircraft, effects, the player's pending orders, then the day's light.
// Positions are interpolated between simulation minutes so ships and planes glide.
(function (MD) {
  'use strict';

  const JP_AIR = '#ff6b4f';
  const US_AIR = '#d6ebff';

  function lerp(view, id, p) {
    const prev = view.prev && view.prev[id];
    if (!prev) return { x: p.x, y: p.y };
    const a = view.alpha;
    return { x: prev.x + (p.x - prev.x) * a, y: prev.y + (p.y - prev.y) * a };
  }

  /** Can the player see this American group right now (or is the battle over and everything revealed)? */
  function groupVisible(state, g, reveal) {
    if (reveal) return true;
    return g.seenT !== undefined && state.t - g.seenT <= 2;
  }

  function flightVisible(state, f, reveal) {
    if (f.side === 'J' || reveal) return true;
    return f.seenT !== undefined && state.t - f.seenT <= 2;
  }

  const Renderer = {
    /** Positions to interpolate from, taken just before each simulation step. */
    snapshot: function (state) {
      const out = {};
      for (const id in state.groups) out['g:' + id] = { x: state.groups[id].x, y: state.groups[id].y };
      for (const id in state.carriers) out['c:' + id] = { x: state.carriers[id].x, y: state.carriers[id].y };
      for (let i = 0; i < state.flights.length; i++) out['f:' + state.flights[i].id] = { x: state.flights[i].x, y: state.flights[i].y };
      return out;
    },

    drawChart: function (ctx, cam, view, now) {
      const state = view.state;
      const minute = state.t + view.alpha;
      MD.Markers.setSafeArea(cam);
      MD.Sea.drawWater(ctx, cam, minute, now);
      MD.Clouds.update(cam, state.fronts, state.t);
      MD.Clouds.drawShadow(ctx, cam);
      MD.Sea.drawGrid(ctx, cam);
      MD.Sea.drawRings(ctx, cam);
      MD.Sea.drawMidway(ctx, cam, state.midway.hp, now);
      Renderer.drawTrails(ctx, cam, state, view.reveal);
      MD.Markers.reports(ctx, cam, state.intel.J.filter(function (r) { return r.t <= state.t; }), minute, view.ui.selectedReport, now);
      Renderer.drawGroups(ctx, cam, view, now);
      MD.Clouds.drawTops(ctx, cam);
      Renderer.drawFlights(ctx, cam, view, now);
      MD.Effects.draw(ctx, cam, now, view.shipAt);
      Renderer.drawOrders(ctx, cam, view, now);
      MD.Sea.drawLight(ctx, cam, minute);
      MD.Sea.drawCompass(ctx, cam);
    },

    /** Wakes of the day: Kido Butai's track always, the Americans' once revealed. */
    drawTrails: function (ctx, cam, state, reveal) {
      for (const id in state.groups) {
        const g = state.groups[id];
        if (g.side !== 'J' && !reveal) continue;
        const pts = g.trail;
        if (pts.length < 2) continue;
        ctx.save();
        ctx.strokeStyle = g.side === 'J' ? 'rgba(255, 140, 110, 0.45)' : 'rgba(150, 200, 255, 0.55)';
        ctx.lineWidth = reveal ? 2 : 1.2;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const s = cam.toScreen(pts[i]);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        }
        const now = cam.toScreen(g);
        ctx.lineTo(now.x, now.y);
        ctx.stroke();
        ctx.restore();
      }
    },

    drawGroups: function (ctx, cam, view, now) {
      view.shipAt = {};
      const state = view.state;
      const scale = MD.Ships.shipScale(cam);
      const sp = MD.Ships.spread(cam);
      for (const id in state.groups) {
        const g = state.groups[id];
        const carriers = MD.Forces.carriersOf(state, id);
        const visible = g.side === 'J' || groupVisible(state, g, view.reveal);
        const gp = lerp(view, 'g:' + id, g);
        const gs = cam.toScreen(gp);
        const sailing = carriers.some(function (c) { return !c.detached; });
        if (visible && (sailing || g.side === 'A')) {
          // The screen of escorts in a ring around the carriers (standing by the burning ones too).
          const n = Math.min(10, g.escorts);
          for (let i = 0; i < n; i++) {
            const o = MD.Ships.escortOffset(i, n, g.course, 4.6 * sp);
            MD.Ships.escort(ctx, gs.x + o.x, gs.y + o.y, g.course, scale, g.side, i % 4 === 0, g.speed, now, i * 0.13);
          }
        }
        for (let i = 0; i < carriers.length; i++) {
          const c = carriers[i];
          if (c.status === 'sunk') continue;
          let x;
          let y;
          if (c.detached) {
            // A burning hulk stays where it was last seen.
            const seen = g.side === 'J' || view.reveal || view.hulks[c.id];
            if (!seen && !visible) continue;
            if (visible) view.hulks[c.id] = true;
            const cp = lerp(view, 'c:' + c.id, c);
            if (MD.Geo.dist(cp, gp) < 12) {
              // Still among its escorts: drawn in the formation's spread-out scale, like the ships around it.
              x = gs.x + (cp.x - gp.x) * sp;
              y = gs.y - (cp.y - gp.y) * sp;
            } else {
              const p = cam.toScreen(cp);
              x = p.x;
              y = p.y;
            }
          } else {
            if (!visible) continue;
            const a = (g.course * Math.PI) / 180;
            x = gs.x + (c.slot.x * Math.cos(a) + c.slot.y * Math.sin(a)) * sp;
            y = gs.y - (-c.slot.x * Math.sin(a) + c.slot.y * Math.cos(a)) * sp;
          }
          const spotted = c.deck.pkg && (c.deck.state === 'spotted' || c.deck.state === 'spotting' || c.deck.state === 'launching') ? c.deck.pkg.D + c.deck.pkg.T + c.deck.pkg.F : 0;
          view.shipAt[c.id] = { x: x, y: y };
          const burning = c.status === 'fatal' || c.status === 'damaged';
          const intensity = c.status === 'fatal' ? 1 : 0.35;
          // Smoke and the glow on the water first, then the hull, then the flames on her deck.
          if (burning) MD.Effects.fire(ctx, cam, x, y, intensity, now, i + 1, state.wind.from, 'under', c.heading);
          MD.Ships.carrier(ctx, x, y, c.heading, scale, {
            side: c.side, length: c.length, islandPort: c.islandPort, status: c.status, spotted: spotted, speed: c.detached ? 0 : g.speed,
            selected: view.ui.selected === c.id, clock: now, seed: i * 0.21,
          });
          if (burning) MD.Effects.fire(ctx, cam, x, y, intensity, now, i + 1, state.wind.from, 'over', c.heading);
          if (cam.zoom > 2.4 || (c.side === 'A' && visible && !view.reveal)) {
            ctx.save();
            ctx.font = '9px Consolas, monospace';
            ctx.fillStyle = c.side === 'J' ? '#ffd6c8' : '#d6ebff';
            const nx = MD.Markers.labelX(x + 14 * scale, ctx.measureText(c.name).width);
            if (nx !== null) ctx.fillText(c.name, nx, y + 3);
            ctx.restore();
          }
        }
        if (visible && sailing) {
          const title = g.side === 'J' ? 'KIDO BUTAI 機動部隊' : g.name.toUpperCase();
          const sub = Math.round(g.course) + '° · ' + Math.round(g.speed) + ' kt';
          MD.Markers.groupLabel(ctx, gs.x + 5.5 * sp, gs.y - 6 * sp - 6, title, sub, g.side === 'J' ? MD.Palette.jp : MD.Palette.us);
        }
      }
    },

    drawFlights: function (ctx, cam, view, now) {
      const state = view.state;
      const scale = MD.Ships.shipScale(cam);
      for (let i = 0; i < state.flights.length; i++) {
        const f = state.flights[i];
        if (f.phase === 'forming' || f.phase === 'catapult' || f.phase === 'gone') continue;
        if (!flightVisible(state, f, view.reveal)) continue;
        const color = f.side === 'J' ? JP_AIR : US_AIR;
        const p = cam.toScreen(lerp(view, 'f:' + f.id, f));
        if (f.kind === 'scout') {
          MD.Aircraft.track(ctx, cam, f, color, 0.55);
          if (f.side === 'J') MD.Aircraft.route(ctx, cam, f, color);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((f.heading * Math.PI) / 180);
          MD.Aircraft.plane(ctx, 3.6 * scale, color);
          ctx.restore();
          if (f.side === 'J') {
            ctx.save();
            ctx.font = '9px Consolas, monospace';
            ctx.fillStyle = 'rgba(255, 200, 180, 0.85)';
            const tag = f.name.replace(' No.', ' ') + (f.phase === 'shadow' ? ' ◉' : '');
            const tx = MD.Markers.labelX(p.x + 7, ctx.measureText(tag).width);
            if (tx !== null) ctx.fillText(tag, tx, p.y - 5);
            ctx.restore();
          }
          continue;
        }
        MD.Aircraft.track(ctx, cam, f, color, 0.85);
        const n = MD.Air.count(f);
        MD.Aircraft.formation(ctx, p.x, p.y, f.heading, n, color, now + i, Math.min(scale, 2.4));
        const status = f.phase === 'holding' ? ' · circling' : f.phase === 'search' ? ' · searching' : f.phase === 'return' ? ' · returning' : '';
        MD.Aircraft.label(ctx, p.x, p.y + 16 + Math.min(12, Math.ceil(n / 6)) * 2, (f.side === 'J' ? f.name : 'ENEMY RAID') + ' · ' + n + status, color);
      }
    },

    drawOrders: function (ctx, cam, view, now) {
      const ui = view.ui;
      const kb = view.state.groups.KB;
      if (ui.target) MD.Markers.target(ctx, cam, ui.target, now, 'TARGET');
      if (ui.drag && ui.drag.kind === 'launch' && ui.drag.world) MD.Markers.aimLine(ctx, cam, kb, ui.drag.world, ui.drag.radius, ui.drag.label);
      if (ui.drag && ui.drag.kind === 'search' && ui.drag.world) {
        const b = MD.Geo.bearing(kb, ui.drag.world);
        const r = Math.max(80, Math.min(300, MD.Geo.dist(kb, ui.drag.world)));
        MD.Markers.searchPreview(ctx, cam, kb, b, r);
      }
      if (ui.drag && ui.drag.kind === 'course' && ui.drag.world) MD.Markers.courseLine(ctx, cam, kb, ui.drag.world);
      if (ui.aiming && ui.hover) MD.Markers.aimLine(ctx, cam, kb, ui.hover, ui.aiming.radius, ui.aiming.label);
      if (kb.waypoint) {
        const a = cam.toScreen(kb);
        const b = cam.toScreen(kb.waypoint);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 140, 110, 0.4)';
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
    },
  };

  MD.Renderer = Renderer;
})(globalThis.MD = globalThis.MD || {});
