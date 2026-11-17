// Boot: sizes the sea canvas and paints the dawn placeholder until the full game loop lands.
(function (MD) {
  'use strict';
  const canvas = document.getElementById('sea');
  const ctx = canvas.getContext('2d');
  function paint() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#c9784a');
    g.addColorStop(0.45, '#12374a');
    g.addColorStop(1, '#0b2233');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e9dfc7';
    ctx.font = 'bold 64px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('MIDWAY: DAWN', canvas.width / 2, canvas.height / 2);
    ctx.font = '20px Georgia, serif';
    ctx.fillText('4 June 1942 · ' + MD.Data.START_CLOCK, canvas.width / 2, canvas.height / 2 + 40);
    window.__shotReady = true;
  }
  window.addEventListener('resize', paint);
  paint();
})(globalThis.MD = globalThis.MD || {});
