// Ships seen from above: carriers with their flight decks, islands and deck markings, the screen of escorts,
// and the white V of their wakes. Sizes are in screen pixels so the fleet reads at any zoom.
(function (MD) {
  'use strict';

  const DEG = Math.PI / 180;

  /** How big ships are drawn at this zoom. */
  function shipScale(cam) {
    return Math.max(0.8, Math.min(4, cam.zoom / 1.25));
  }

  /** Screen pixels per nm between ships in a formation (spread out so they never overlap). */
  function spread(cam) {
    return Math.max(cam.zoom, 6.5 * shipScale(cam));
  }

  /** The white V behind a moving hull, with foam that pulses along it. */
  function wake(ctx, len, beam, speed, clock, seed) {
    if (speed < 1) return;
    const tail = Math.min(len * (0.9 + speed / 20), 46);
    const g = ctx.createLinearGradient(0, len * 0.45, 0, len * 0.45 + tail);
    g.addColorStop(0, 'rgba(235, 248, 255, 0.42)');
    g.addColorStop(1, 'rgba(235, 248, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-beam * 0.5, len * 0.42);
    ctx.lineTo(-beam * 0.5 - tail * 0.22, len * 0.45 + tail);
    ctx.lineTo(-beam * 0.2 - tail * 0.14, len * 0.45 + tail);
    ctx.lineTo(0, len * 0.6);
    ctx.lineTo(beam * 0.2 + tail * 0.14, len * 0.45 + tail);
    ctx.lineTo(beam * 0.5 + tail * 0.22, len * 0.45 + tail);
    ctx.lineTo(beam * 0.5, len * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (let i = 0; i < 6; i++) {
      const ph = (clock * 0.6 + i / 6 + seed) % 1;
      const y = len * 0.45 + ph * tail;
      const spreadX = beam * 0.5 + ph * tail * 0.2;
      const r = 0.9 + (1 - ph) * 1.1;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath();
      ctx.arc(-spreadX, y, r, 0, Math.PI * 2);
      ctx.arc(spreadX, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** A hull outline: pointed bow at -y, square stern at +y. */
  function hullPath(ctx, len, beam) {
    ctx.beginPath();
    ctx.moveTo(0, -len / 2);
    ctx.quadraticCurveTo(beam * 0.55, -len * 0.25, beam / 2, 0);
    ctx.lineTo(beam * 0.44, len / 2);
    ctx.lineTo(-beam * 0.44, len / 2);
    ctx.lineTo(-beam / 2, 0);
    ctx.quadraticCurveTo(-beam * 0.55, -len * 0.25, 0, -len / 2);
    ctx.closePath();
  }

  const Ships = {
    shipScale: shipScale,
    spread: spread,

    /**
     * A carrier, top-down, centred on (x, y) and heading `heading` degrees.
     * opts: side, length factor, islandPort, status, spotted (planes ranged on deck), selected, clock.
     */
    carrier: function (ctx, x, y, heading, scale, opts) {
      const len = 30 * scale * (opts.length || 1);
      const beam = len * 0.17;
      const deckW = len * 0.2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading * DEG);
      const dead = opts.status === 'fatal' || opts.status === 'sunk';
      if (!dead) wake(ctx, len, beam, opts.speed || 0, opts.clock || 0, opts.seed || 0);
      if (opts.selected) {
        ctx.strokeStyle = 'rgba(201, 164, 92, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.ellipse(0, 0, beam * 1.6, len * 0.66, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Shadow on the water.
      ctx.fillStyle = 'rgba(0, 10, 18, 0.45)';
      ctx.save();
      ctx.translate(2, 2);
      hullPath(ctx, len, beam);
      ctx.fill();
      ctx.restore();
      // Hull.
      ctx.fillStyle = dead ? '#4a4038' : opts.side === 'J' ? '#4a4f55' : '#5a6672';
      hullPath(ctx, len, beam);
      ctx.fill();
      if (dead) {
        // A burning ship keeps her outline against the smoke.
        ctx.strokeStyle = 'rgba(255, 200, 150, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // Flight deck, overhanging the hull.
      const deckTop = -len * 0.42;
      const deckLen = len * 0.86;
      ctx.fillStyle = dead ? '#7a5636' : opts.side === 'J' ? '#b8915d' : '#8f8b7d';
      ctx.fillRect(-deckW / 2, deckTop, deckW, deckLen);
      // Deck planking lines and the elevators.
      ctx.strokeStyle = dead ? 'rgba(0,0,0,0.3)' : 'rgba(60, 40, 20, 0.35)';
      ctx.lineWidth = 0.6;
      for (let i = 1; i < 4; i++) {
        const xx = -deckW / 2 + (deckW * i) / 4;
        ctx.beginPath();
        ctx.moveTo(xx, deckTop + 1);
        ctx.lineTo(xx, deckTop + deckLen - 1);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40, 30, 20, 0.45)';
      ctx.fillRect(-deckW * 0.28, deckTop + deckLen * 0.18, deckW * 0.56, deckW * 0.5);
      ctx.fillRect(-deckW * 0.28, deckTop + deckLen * 0.62, deckW * 0.56, deckW * 0.5);
      if (opts.side === 'J' && !dead) {
        // The red disc painted on the flight deck.
        ctx.fillStyle = '#ece4d2';
        ctx.fillRect(-deckW * 0.42, deckTop + deckLen * 0.05, deckW * 0.84, deckW * 0.84);
        ctx.fillStyle = MD.Palette.jp;
        ctx.beginPath();
        ctx.arc(0, deckTop + deckLen * 0.05 + deckW * 0.42, deckW * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (!dead) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, deckTop + 2);
        ctx.lineTo(0, deckTop + deckLen - 2);
        ctx.stroke();
      }
      // Aircraft ranged aft for launch.
      if (opts.spotted && !dead) {
        const rows = Math.min(6, Math.ceil(opts.spotted / 9));
        ctx.fillStyle = opts.side === 'J' ? '#e7e2d0' : '#cfd8de';
        for (let r = 0; r < rows; r++) {
          for (let k = -1; k <= 1; k++) {
            const px = k * deckW * 0.3;
            const py = deckTop + deckLen * 0.55 + r * deckW * 0.33;
            if (py > deckTop + deckLen - 2) continue;
            ctx.fillRect(px - deckW * 0.13, py, deckW * 0.26, 1.1);
            ctx.fillRect(px - 0.5, py - deckW * 0.08, 1, deckW * 0.2);
          }
        }
      }
      // Island.
      const side = opts.islandPort ? -1 : 1;
      ctx.fillStyle = dead ? '#1d1a18' : '#3a3f45';
      ctx.fillRect(side * deckW * 0.5 - (side > 0 ? 0 : deckW * 0.22), -len * 0.12, deckW * 0.22, len * 0.13);
      ctx.restore();
      return len;
    },

    /** A destroyer or cruiser of the screen. */
    escort: function (ctx, x, y, heading, scale, side, big, speed, clock, seed) {
      const len = (big ? 20 : 13) * scale;
      const beam = len * (big ? 0.14 : 0.12);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading * DEG);
      wake(ctx, len, beam, speed, clock, seed);
      ctx.fillStyle = side === 'J' ? '#3f454b' : '#55606b';
      hullPath(ctx, len, beam);
      ctx.fill();
      ctx.fillStyle = 'rgba(200, 200, 190, 0.5)';
      ctx.fillRect(-beam * 0.18, -len * 0.18, beam * 0.36, len * 0.3);
      if (big) {
        ctx.fillStyle = '#2b3035';
        ctx.fillRect(-beam * 0.25, -len * 0.34, beam * 0.5, len * 0.08);
        ctx.fillRect(-beam * 0.25, len * 0.22, beam * 0.5, len * 0.08);
      }
      ctx.restore();
    },

    /** Where a group's ship i of n escorts sits (screen offset), in a ring around the carriers. */
    escortOffset: function (i, n, heading, radiusPx) {
      const a = (i / n) * Math.PI * 2 + heading * DEG;
      return { x: Math.sin(a) * radiusPx, y: -Math.cos(a) * radiusPx * 0.85 };
    },
  };

  MD.Ships = Ships;
})(globalThis.MD = globalThis.MD || {});
