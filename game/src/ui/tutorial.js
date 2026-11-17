// Four short lessons at the first battle, each beside the part of the screen it explains. Skippable, and
// remembered (in this browser only) once seen; the ? button replays them.
(function (MD) {
  'use strict';

  const KEY = 'midway-dawn-tutorial-v1';
  const STEPS = [
    {
      title: 'YOUR CARRIERS',
      text: 'Hiryu and Soryu have the first strike on Midway spotted on deck. Drag a glowing card onto Midway — or press LAUNCH, then click the target. Spotting takes 35–55 minutes; rearming 75.',
      at: function () { return { left: 312, top: 70 }; },
    },
    {
      title: 'SEARCH',
      text: 'The enemy carriers are somewhere out there. Right-drag from the fleet across the chart to send a search plane down that line. Reports come back late, and sometimes wrong.',
      at: function () { return { left: Math.round(window.innerWidth / 2 - 150), top: 120 }; },
    },
    {
      title: 'SIGNALS',
      text: 'Sightings, raids and strike results arrive here. Click a slip to see it on the chart; click a sighting diamond to make it the target.',
      at: function () { return { left: window.innerWidth - 600, top: 80 }; },
    },
    {
      title: 'THE FIVE MINUTES',
      text: 'A bomb that lands while armed planes crowd the deck — or while the hangar is full of loose ordnance — is fatal. Strike first. Space pauses (you can give orders while paused); 1, 2, 3 set the speed.',
      at: function () { return { left: Math.round(window.innerWidth / 2 - 150), top: window.innerHeight - 220 }; },
    },
  ];

  let step = -1;
  let onDone = null;

  function remembered() {
    try {
      return window.localStorage.getItem(KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function remember() {
    try {
      window.localStorage.setItem(KEY, '1');
    } catch (e) {
      // Private windows may refuse storage; the tutorial simply shows again next time.
    }
  }

  function render() {
    const box = document.getElementById('tutorial');
    if (step < 0 || step >= STEPS.length) {
      box.classList.add('hidden');
      return;
    }
    const s = STEPS[step];
    const at = s.at();
    box.style.left = at.left + 'px';
    box.style.top = at.top + 'px';
    box.innerHTML =
      '<div class="step">' + (step + 1) + ' / ' + STEPS.length + '</div><h4>' + s.title + '</h4><div>' + s.text + '</div>' +
      '<div class="tut-btns"><button class="skip">Skip</button><button class="next">' + (step === STEPS.length - 1 ? 'To battle' : 'Next') + '</button></div>';
    box.classList.remove('hidden');
    box.querySelector('.skip').onclick = Tutorial.finish;
    box.querySelector('.next').onclick = function () {
      MD.Sound.click();
      step++;
      if (step >= STEPS.length) Tutorial.finish();
      else render();
    };
  }

  const Tutorial = {
    /** Starts the lessons; `force` replays them even if seen. Returns whether they started. */
    start: function (force, done) {
      onDone = done || null;
      if (!force && remembered()) {
        step = -1;
        if (onDone) onDone();
        return false;
      }
      step = 0;
      render();
      return true;
    },

    finish: function () {
      step = -1;
      remember();
      render();
      if (onDone) {
        const f = onDone;
        onDone = null;
        f();
      }
    },

    done: function () {
      return step < 0;
    },
  };

  MD.Tutorial = Tutorial;
})(globalThis.MD = globalThis.MD || {});
