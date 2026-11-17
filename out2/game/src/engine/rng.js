// Seeded, order-independent randomness for the simulation.
// Every roll is keyed: hash(seed, "event:name:id:minute") -> one uniform number. A roll never depends on how
// many rolls came before it, so adding a new random event never shifts the outcome of an old one, and the same
// seed and orders always replay the same battle. Math.random() is never used by the engine.
(function (MD) {
  'use strict';

  /** FNV-1a over a string, folded with the seed: a 32-bit unsigned hash. */
  function hashKey(seed, key) {
    let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /** mulberry32's finaliser: spreads a 32-bit state into a well-mixed 32-bit output. */
  function mix32(a) {
    let t = (a + 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** A uniform number in [0, 1) for this seed and key. */
  function uniform(seed, key) {
    return mix32(hashKey(seed, key)) / 4294967296;
  }

  /** A sequential generator (mulberry32) for render-side decoration that must still be repeatable. */
  function stream(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** The keyed rolls a simulation state makes; `state.seed` is its only source of chance. */
  const Rng = {
    hashKey: hashKey,
    stream: stream,
    u: function (state, key) {
      return uniform(state.seed, key);
    },
    chance: function (state, key, p) {
      return uniform(state.seed, key) < p;
    },
    range: function (state, key, lo, hi) {
      return lo + (hi - lo) * uniform(state.seed, key);
    },
    int: function (state, key, lo, hi) {
      return lo + Math.floor((hi - lo + 1) * uniform(state.seed, key));
    },
    /** Binomial(n, p) as n keyed Bernoulli trials: exact, and cheap at these sizes. */
    binomial: function (state, key, n, p) {
      if (n <= 0 || p <= 0) return 0;
      if (p >= 1) return n;
      let k = 0;
      for (let i = 0; i < n; i++) if (uniform(state.seed, key + '#' + i) < p) k++;
      return k;
    },
    pick: function (state, key, list) {
      return list[Math.floor(uniform(state.seed, key) * list.length) % list.length];
    },
  };

  MD.Rng = Rng;
})(globalThis.MD = globalThis.MD || {});
