// The order of battle and every tuned number of the simulation, in one place.
// Times are game minutes, speeds knots, distances nautical miles. Sides: 'J' (the player, Kido Butai) and 'A'.
(function (MD) {
  'use strict';

  const Data = {
    START_CLOCK: '04:30',
    END_MINUTE: 14 * 60, // 18:30
    SUNRISE_MINUTE: 25, // 04:55
    SUNSET_MINUTE: 14 * 60 + 15, // 18:45
    MAP_RADIUS: 450,

    /** Aircraft types: speed kt, radius nm (by ordnance), hit and drop rates, fighter attack / defence factors. */
    aircraft: {
      A6M: { side: 'J', role: 'F', name: 'A6M Zero', speed: 140, radius: 300, atk: 1.15, def: 0.95 },
      D3A: { side: 'J', role: 'D', name: 'D3A Val', speed: 130, radius: 240, hit: 0.25, drop: 0.85 },
      B5N: { side: 'J', role: 'T', name: 'B5N Kate', speed: 125, radius: 260, radiusTorp: 230, hit: 0.2, drop: 0.75 },
      E13A: { side: 'J', role: 'S', name: 'E13A floatplane', speed: 120, radius: 300, comm: 0.85, ident: 0.55 },
      D4Y: { side: 'J', role: 'S', name: 'D4Y scout', speed: 200, radius: 330, comm: 0.85, ident: 0.7 },
      F4F: { side: 'A', role: 'F', name: 'F4F Wildcat', speed: 140, radius: 180, atk: 0.95, def: 1.2 * 1.1 },
      F2A: { side: 'A', role: 'F', name: 'F2A Buffalo', speed: 130, radius: 150, atk: 0.65, def: 0.7 },
      SBD: { side: 'A', role: 'D', name: 'SBD Dauntless', speed: 125, radius: 240, hit: 0.2, drop: 0.9 },
      TBD: { side: 'A', role: 'T', name: 'TBD Devastator', speed: 100, radius: 150, radiusTorp: 150, hit: 0.07, drop: 0.7 },
      TBF: { side: 'A', role: 'T', name: 'TBF Avenger', speed: 140, radius: 260, radiusTorp: 260, hit: 0.07, drop: 0.7 },
      B26: { side: 'A', role: 'T', name: 'B-26 Marauder', speed: 180, radius: 400, radiusTorp: 400, hit: 0.07, drop: 0.7 },
      SB2U: { side: 'A', role: 'D', name: 'SB2U Vindicator', speed: 120, radius: 190, hit: 0.06, drop: 0.8 },
      B17: { side: 'A', role: 'H', name: 'B-17 Fortress', speed: 160, radius: 600, hit: 0.02, drop: 0.98 },
      PBY: { side: 'A', role: 'S', name: 'PBY Catalina', speed: 110, radius: 700, comm: 0.9, ident: 0.55 },
    },

    /** Which type flies each role for a side's carriers. */
    carrierTypes: {
      J: { F: 'A6M', D: 'D3A', T: 'B5N' },
      A: { F: 'F4F', D: 'SBD', T: 'TBD' },
    },

    /** Task groups at 04:30: bearing / range from Midway, course, speed. */
    groups: [
      { id: 'KB', side: 'J', name: 'Kido Butai', kanji: '機動部隊', bearing: 318, range: 240, course: 135, speed: 24, escorts: 12 },
      { id: 'TF16', side: 'A', name: 'Task Force 16', kanji: '', bearing: 24, range: 260, course: 240, speed: 5, escorts: 8 },
      { id: 'TF17', side: 'A', name: 'Task Force 17', kanji: '', bearing: 24, range: 275, course: 240, speed: 5, escorts: 6 },
    ],

    /** Carriers, their air groups and where in the formation they steam (nm, x east / y north of the guide). */
    carriers: [
      { id: 'akagi', side: 'J', group: 'KB', name: 'AKAGI', kanji: '赤城', F: 18, D: 18, T: 18, S: 0, islandPort: true, slot: { x: -3, y: 2.5 }, length: 1.0, cap: 6 },
      { id: 'kaga', side: 'J', group: 'KB', name: 'KAGA', kanji: '加賀', F: 18, D: 18, T: 27, S: 0, islandPort: false, slot: { x: -3, y: -2.5 }, length: 1.02, cap: 6 },
      { id: 'soryu', side: 'J', group: 'KB', name: 'SORYU', kanji: '蒼龍', F: 18, D: 16, T: 18, S: 2, islandPort: false, slot: { x: 3, y: -2.5 }, length: 0.86, cap: 6 },
      { id: 'hiryu', side: 'J', group: 'KB', name: 'HIRYU', kanji: '飛龍', F: 18, D: 18, T: 18, S: 0, islandPort: true, slot: { x: 3, y: 2.5 }, length: 0.88, cap: 6 },
      { id: 'enterprise', side: 'A', group: 'TF16', name: 'ENTERPRISE', kanji: '', F: 27, D: 38, T: 14, S: 0, islandPort: false, slot: { x: -2.5, y: 0 }, length: 0.96, cap: 8, escort: 10, nav: 0.9 },
      { id: 'hornet', side: 'A', group: 'TF16', name: 'HORNET', kanji: '', F: 27, D: 37, T: 15, S: 0, islandPort: false, slot: { x: 2.5, y: 0 }, length: 0.96, cap: 8, escort: 10, nav: 0.65 },
      { id: 'yorktown', side: 'A', group: 'TF17', name: 'YORKTOWN', kanji: '', F: 25, D: 37, T: 13, S: 0, islandPort: false, slot: { x: 0, y: 0 }, length: 0.96, cap: 6, escort: 6, nav: 0.9, reserveD: 17 },
    ],

    /** Midway's air station: fighters defend it, the rest attack Kido Butai once it is found. */
    midway: {
      hp: 100,
      fighters: { F2A: 21, F4F: 7 },
      bombers: { SBD: 19, SB2U: 21, TBF: 6, B26: 4, B17: 16 },
      pby: 31,
      nav: 0.75,
      aa: 0.07,
    },

    /** Kido Butai's search planes: cruiser and battleship floatplanes plus Soryu's two D4Y. */
    scouts: [
      { id: 'tone1', name: 'TONE No.1', ship: 'Tone', type: 'E13A' },
      { id: 'tone4', name: 'TONE No.4', ship: 'Tone', type: 'E13A' },
      { id: 'chikuma1', name: 'CHIKUMA No.1', ship: 'Chikuma', type: 'E13A' },
      { id: 'chikuma5', name: 'CHIKUMA No.5', ship: 'Chikuma', type: 'E13A' },
      { id: 'haruna', name: 'HARUNA', ship: 'Haruna', type: 'E13A' },
      { id: 'akagi-s', name: 'AKAGI B5N', ship: 'Akagi', type: 'E13A' },
      { id: 'kaga-s', name: 'KAGA B5N', ship: 'Kaga', type: 'E13A' },
      { id: 'soryu-d4y1', name: 'SORYU D4Y-1', ship: 'Soryu', type: 'D4Y' },
      { id: 'soryu-d4y2', name: 'SORYU D4Y-2', ship: 'Soryu', type: 'D4Y' },
    ],

    deck: {
      spotMin: 35,
      spotMax: 55,
      launch: 10,
      rearm: 75,
      strikeDown: 15,
      recover: 45,
      faultChance: 0.08,
      faultMin: 15,
      faultMax: 40,
      launchAccident: 0.008,
      landAccident: 0.015,
      escortPerCarrier: 9,
      capStep: 3, // fighters per 5 minutes that can join or leave CAP while the deck is free
      holdingFuel: 50, // minutes a returning strike can circle before it starts to ditch
    },

    search: {
      chance: 0.6,
      sightRadius: 28,
      reportDelayMin: 3,
      reportDelayMax: 15,
      misident: 0.15,
      errMin: 5,
      errMax: 35,
      biasChance: 0.08,
      biasMin: 15,
      biasMax: 40,
      shadowMinutes: 80,
      shadowEvery: 25,
      shadowLoss: 0.1,
      catapultDelayChance: 0.3,
      catapultDelayMax: 30,
      legOut: 300,
      legCross: 60,
    },

    combat: {
      capCoordJ: 0.7,
      capCoordA: 0.75 * 1.7,
      torpedoDistract: 0.3,
      torpedoDistractMinutes: 30,
      killCap: 0.8,
      killScale: 0.45,
      escortWeight: 0.8,
      aaJ: 0.06,
      aaA: 0.08,
      strikeSight: 30,
      searchMinutes: 25,
      navJ: 0.95,
      b17Evasion: 0.2,
    },

    damage: {
      baseJ: 0.1,
      baseA: 0.04,
      exposed: 0.55,
      perHit: 0.25,
      landBombFactor: 0.6,
      deckOutMin: 60,
      deckOutMax: 150,
      sinkMin: 120,
      sinkMax: 480,
      midwayLand: 1.1,
      midwayShip: 0.7,
    },

    score: {
      carrierLost: 12,
      carrierDamaged: 4,
      midwayRuined: 6,
      planesPerPoint: 10,
    },

    /** The three settings on the title screen. */
    difficulty: {
      novice: { name: 'Novice', kanji: '新手', usDelay: 30, usSearch: 0.5, usCommDelay: 1.3, hornetLost: 0.5, jSearch: 0.75 },
      historical: { name: 'Historical', kanji: '史実', usDelay: 0, usSearch: 0.6, usCommDelay: 1, hornetLost: 0.35, jSearch: 0.6 },
      admiral: { name: 'Admiral', kanji: '提督', usDelay: -20, usSearch: 0.8, usCommDelay: 0.6, hornetLost: 0.15, jSearch: 0.6 },
    },
  };

  MD.Data = Data;
})(globalThis.MD = globalThis.MD || {});
