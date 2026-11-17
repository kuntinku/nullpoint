// Boot and the one loop: input is read every frame, the run advances in fixed 1/60 s steps (several
// in a slow frame, none in a fast one), and the renderer paints what is there. The game moves
// between six screens: title, play, intermission, paused, over and win.
//
// ?seed=N fixes the wave pattern. ?shot=start|play|intermission|end|win (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { beginWave, createWorld, reset, step, EVENT_HIT, EVENT_OVER, EVENT_WAVE, EVENT_WIN } from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_PAUSE,
  ACTION_PICK_1,
  ACTION_PICK_2,
  ACTION_PICK_3,
  ACTION_RESTART,
  createInput,
} from './input.js';
import {
  createRenderer,
  SCREEN_INTERMISSION,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';
import { drawUpgrades, takeUpgrade } from './upgrades.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, state);
  let painted = 0;
  function paint() {
    renderer.draw(state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startRun() {
    reset(state);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Deployed. Wave 1. Hold the core.');
  }

  function finishRun(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (state.score > best) {
      best = state.score;
      saveBest(best);
    }
    announce(
      won
        ? `Core secured. Score ${state.score}. Best ${best}.`
        : `Core breached on wave ${state.wave + 1}. Score ${state.score}. Best ${best}.`,
    );
  }

  function openIntermission() {
    state.offers = drawUpgrades(state.random, state, 3);
    screen = SCREEN_INTERMISSION;
    announce(`Wave ${state.wave + 1} cleared. Choose an upgrade: 1, 2 or 3.`);
  }

  function choose(index) {
    if (screen !== SCREEN_INTERMISSION) return;
    const card = state.offers[index];
    if (!card) return;
    takeUpgrade(state, card);
    beginWave(state);
    screen = SCREEN_PLAY;
    announce(`${card.name} taken. Wave ${state.wave + 1}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_RESTART) {
      if (screen === SCREEN_OVER || screen === SCREEN_WIN || screen === SCREEN_PAUSED) startRun();
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_INTERMISSION) {
      if (actions & ACTION_PICK_1) choose(0);
      else if (actions & ACTION_PICK_2) choose(1);
      else if (actions & ACTION_PICK_3) choose(2);
      else if (actions & ACTION_CONFIRM) choose(0);
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startRun();
    }
  }

  function advance() {
    if (screen === SCREEN_TITLE) {
      step(state, { x: 0, y: 0 }, null, false);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = step(state, input.move(), input.aim(), input.firing());
    if (events & EVENT_OVER) finishRun(false);
    else if (events & EVENT_WIN) finishRun(true);
    else if (events & EVENT_WAVE) openIntermission();
    else if (events & EVENT_HIT) {
      announce(`Core hit. ${Math.ceil(state.core.integrity)}% integrity left.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        advance();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the core take hits unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Nullpoint. Press Space or click to deploy.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
