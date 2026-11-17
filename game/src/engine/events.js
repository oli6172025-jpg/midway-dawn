// The battle log: everything that happens is one event with a minute, a kind and the side that learns of it.
// The interface turns events into telegrams, sounds, explosions and auto-pauses; the debrief reads them back.
(function (MD) {
  'use strict';

  /**
   * Kinds and who they are for:
   *   report      a sighting telegram (to the side whose scout sent it)
   *   order       a command was accepted or refused (to the player)
   *   deck        a deck task finished (spotted, launched, rearmed, recovered)
   *   raid        enemy aircraft seen approaching (to the defenders)
   *   airbattle   CAP met a strike (both sides; x, y for the tracers)
   *   bombing     bombs and torpedoes fell (both sides; hits per carrier)
   *   damage      a carrier was hit: damaged or fatal
   *   sunk        a carrier went down
   *   midway      the airfield was hit
   *   flight      a flight returned, ditched or found nothing
   *   info        anything else worth a line
   */
  const Events = {
    emit: function (state, kind, side, text, extra) {
      const e = { i: state.log.length, t: state.t, kind: kind, side: side, text: text };
      if (extra) for (const k in extra) e[k] = extra[k];
      state.log.push(e);
      return e;
    },
  };

  MD.Events = Events;
})(globalThis.MD = globalThis.MD || {});
