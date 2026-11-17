// The screenshot scenes behind ?shot=start|play|intermission|end|win. Each one plays the real rules
// forward from a fresh run, steered by a simple autopilot (aim at the nearest enemy, hold the ship
// between the core and the threat, fire always), so the frame is what a real run looks like and the
// same seed always gives the same frame.
import { CORE, STEP, WAVES } from './config.js';
import { beginWave, step, EVENT_OVER, EVENT_WAVE, EVENT_WIN } from './world.js';
import { drawUpgrades, takeUpgrade } from './upgrades.js';
import {
  SCREEN_INTERMISSION,
  SCREEN_OVER,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';

const START_SECONDS = 3;
/**
 * The play scene is staged inside a late, busy wave. The pilot fires for a few seconds, then holds
 * fire for the last stretch, so the frame shows a real mid-wave moment: a full arena of enemies
 * closing on the core, the ship repositioning, and its last shots still in flight.
 */
const PLAY_WAVE = 7;
const PLAY_FIRING_SECONDS = 5.5;
const END_LIMIT_SECONDS = 900;
const WIN_LIMIT_SECONDS = 2400;

/** The nearest enemy to the ship, or null. */
function nearest(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    const distance = Math.hypot(enemy.x - state.ship.x, enemy.y - state.ship.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

/**
 * Where the autopilot flies: a point on the line from the core to the nearest enemy, held a little
 * inside the leash, so it intercepts before the enemy reaches the core.
 */
function autopilotMove(state) {
  const target = nearest(state);
  if (!target) return { x: 0, y: 0 };
  const dx = target.x - CORE.x;
  const dy = target.y - CORE.y;
  const length = Math.hypot(dx, dy) || 1;
  const standoff = Math.min(230, Math.max(90, length - 120));
  const wantX = CORE.x + (dx / length) * standoff;
  const wantY = CORE.y + (dy / length) * standoff;
  const toX = wantX - state.ship.x;
  const toY = wantY - state.ship.y;
  const distance = Math.hypot(toX, toY);
  if (distance < 12) return { x: 0, y: 0 };
  return { x: toX / distance, y: toY / distance };
}

/** Aim at the nearest enemy, or straight out from the core when there is none. */
function autopilotAim(state) {
  const target = nearest(state);
  if (target) return { x: target.x, y: target.y };
  return { x: state.ship.x, y: state.ship.y - 100 };
}

/**
 * A hurried player's aim: the same target, swung wide by `offset` radians, so the shots streak
 * across the arena and miss. The play scene uses it to show a real mid-wave frame with a full
 * arena of enemies and the ship's fire in flight, rather than a cleared one.
 */
function sloppyAim(state, offset) {
  const target = nearest(state);
  if (!target) return { x: state.ship.x, y: state.ship.y - 100 };
  const angle = Math.atan2(target.y - state.ship.y, target.x - state.ship.x) + offset;
  return {
    x: state.ship.x + Math.cos(angle) * 400,
    y: state.ship.y + Math.sin(angle) * 400,
  };
}

/**
 * Play the run forward. `pilot` is 'good' (intercept and fire) or 'idle' (a player who never
 * defends: the ship sits still and never fires, so the core falls). `takeUpgrades` picks the first
 * card offered; `stopAtWave` stops the moment that wave index begins.
 */
function playForward(state, seconds, options) {
  const { takeUpgrades = true, pilot = 'good', stopAtWave = -1, firing = true, aimOffset = 0 } = options ?? {};
  const limit = Math.round(seconds / STEP);
  for (let index = 0; index < limit; index += 1) {
    if (state.intermission) {
      if (!takeUpgrades) return { screen: SCREEN_INTERMISSION };
      if (state.offers.length === 0) state.offers = drawUpgrades(state.random, state, 3);
      takeUpgrade(state, state.offers[0]);
      beginWave(state);
      if (state.wave === stopAtWave) return { screen: SCREEN_PLAY };
      continue;
    }
    const move = pilot === 'good' ? autopilotMove(state) : { x: 0, y: 0 };
    const aim = pilot === 'good' ? (aimOffset === 0 ? autopilotAim(state) : sloppyAim(state, aimOffset)) : null;
    const events = step(state, move, aim, pilot === 'good' && firing);
    if (events & EVENT_OVER) return { screen: SCREEN_OVER };
    if (events & EVENT_WIN) return { screen: SCREEN_WIN };
    if (events & EVENT_WAVE) {
      state.offers = drawUpgrades(state.random, state, 3);
      if (!takeUpgrades) return { screen: SCREEN_INTERMISSION };
    }
  }
  return { screen: SCREEN_PLAY };
}

/**
 * Set `state` to the named scene and return the screen to draw over it and the best score to show.
 * Any name but play, intermission, end and win is the title screen.
 */
export function stageShot(name, state) {
  if (name === 'play') {
    // Reach a busy wave, then play it with a wide, hurried aim: the arena fills with enemies while
    // the ship's shots streak across it, which is what a real mid-wave frame looks like.
    const reached = playForward(state, 600, { takeUpgrades: true, stopAtWave: PLAY_WAVE });
    if (reached.screen !== SCREEN_PLAY) return reached;
    const result = playForward(state, PLAY_FIRING_SECONDS, { takeUpgrades: true, aimOffset: 0.55 });
    return { screen: result.screen === SCREEN_PLAY ? SCREEN_PLAY : result.screen, best: 0 };
  }
  if (name === 'intermission') {
    // Play until the first wave is cleared, then stop on the upgrade cards.
    const result = playForward(state, 240, { takeUpgrades: false });
    if (state.offers.length === 0) state.offers = drawUpgrades(state.random, state, 3);
    return { screen: result.screen === SCREEN_INTERMISSION ? SCREEN_INTERMISSION : SCREEN_PLAY, best: 0 };
  }
  if (name === 'end') {
    // A player who never defends: the core falls, and the results screen is the real one.
    const result = playForward(state, END_LIMIT_SECONDS, { takeUpgrades: true, pilot: 'idle' });
    return { screen: result.screen === SCREEN_OVER ? SCREEN_OVER : SCREEN_PLAY, best: 0 };
  }
  if (name === 'win') {
    const result = playForward(state, WIN_LIMIT_SECONDS, { takeUpgrades: true });
    return { screen: result.screen === SCREEN_WIN ? SCREEN_WIN : SCREEN_PLAY, best: 0 };
  }
  // The title screen: let the arena breathe for a moment behind it.
  for (let index = 0; index < START_SECONDS / STEP; index += 1) step(state, { x: 0, y: 0 }, null, false);
  return { screen: SCREEN_TITLE, best: 0 };
}

export { WAVES };
