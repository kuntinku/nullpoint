// The simulation: the ship, its shots, the enemies, the core and the score. It is pure state and
// fixed-step updates with no drawing and no DOM, so the same seed and the same inputs always give
// the same run, and the screenshot scenes can play the real rules forward.
import { BULLET, COMBO, CORE, FIELD, PLAYER, STEP, WAVES } from './config.js';
import { between, intBetween } from './random.js';
import { buildQueue, waveLabel, waveSize } from './waves.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE = 4;
export const EVENT_WIN = 8;

export const KIND_DRIFTER = 'drifter';
export const KIND_RUNNER = 'runner';
export const KIND_BRUTE = 'brute';
export const KIND_WEAVER = 'weaver';
export const KIND_SPLITTER = 'splitter';

/** Each enemy kind's body: hit points, speed, radius, what it is worth and how it hurts the core. */
export const ENEMY_KINDS = {
  [KIND_DRIFTER]: { hp: 2, speed: 62, radius: 15, points: 10, damage: 7, colour: 'drifter' },
  [KIND_RUNNER]: { hp: 1, speed: 128, radius: 11, points: 14, damage: 5, colour: 'runner' },
  [KIND_BRUTE]: { hp: 9, speed: 40, radius: 26, points: 40, damage: 18, colour: 'brute' },
  [KIND_WEAVER]: { hp: 3, speed: 74, radius: 14, points: 18, damage: 8, colour: 'weaver' },
  [KIND_SPLITTER]: { hp: 4, speed: 56, radius: 19, points: 22, damage: 10, colour: 'splitter' },
};

/** How much faster each wave's enemies move than the first wave's. */
const WAVE_SPEED_STEP = 0.055;

export function createWorld(random) {
  const state = {
    random,
    time: 0,
    wave: 0,
    waveLabel: waveLabel(0),
    waveTotal: waveSize(0),
    waveLeft: waveSize(0),
    queue: [],
    spawnClock: 0,
    core: { x: CORE.x, y: CORE.y, radius: CORE.radius, integrity: CORE.integrity, max: CORE.integrity },
    ship: {
      x: CORE.x,
      y: CORE.y - 150,
      radius: PLAYER.radius,
      speed: PLAYER.speed,
      fireInterval: PLAYER.fireInterval,
      bulletSpeed: PLAYER.bulletSpeed,
      bulletRadius: PLAYER.bulletRadius,
      damage: PLAYER.damage,
      pierce: PLAYER.pierce,
      shots: PLAYER.shots,
      spread: PLAYER.spread,
      cooldown: 0,
      aim: -Math.PI / 2,
      invulnerable: 0,
    },
    bullets: [],
    enemies: [],
    particles: [],
    drones: 0,
    droneAngle: 0,
    slowField: 0,
    score: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    takenUpgrades: {},
    upgradeLog: [],
    shotsFired: 0,
    shotsHit: 0,
    over: false,
    won: false,
    intermission: false,
    intermissionLeft: 0,
    offers: [],
    waveCleared: 0,
  };
  resetWave(state, 0);
  return state;
}

/** Put the run back to its first wave, keeping the generator. */
export function reset(state) {
  const random = state.random;
  state.time = 0;
  state.wave = 0;
  state.queue = [];
  state.spawnClock = 0;
  state.core.integrity = state.core.max;
  state.ship.x = CORE.x;
  state.ship.y = CORE.y - 150;
  state.ship.fireInterval = PLAYER.fireInterval;
  state.ship.bulletSpeed = PLAYER.bulletSpeed;
  state.ship.damage = PLAYER.damage;
  state.ship.pierce = PLAYER.pierce;
  state.ship.shots = PLAYER.shots;
  state.ship.cooldown = 0;
  state.ship.aim = -Math.PI / 2;
  state.bullets.length = 0;
  state.enemies.length = 0;
  state.particles.length = 0;
  state.drones = 0;
  state.droneAngle = 0;
  state.slowField = 0;
  state.score = 0;
  state.kills = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.bestCombo = 0;
  state.takenUpgrades = {};
  state.upgradeLog = [];
  state.shotsFired = 0;
  state.shotsHit = 0;
  state.over = false;
  state.won = false;
  state.intermission = false;
  state.intermissionLeft = 0;
  state.offers = [];
  state.waveCleared = 0;
  state.random = random;
  resetWave(state, 0);
}

function resetWave(state, index) {
  state.wave = index;
  state.waveLabel = waveLabel(index);
  state.queue = buildQueue(index);
  state.waveTotal = state.queue.length;
  state.waveLeft = state.queue.length;
  state.spawnClock = 0;
}

/** The speed multiplier the current wave gives its enemies. */
function waveSpeed(state) {
  return 1 + state.wave * WAVE_SPEED_STEP;
}

/** Spawn one enemy of `kind` at the arena's edge, aimed at the core. */
function spawnEnemy(state, kind, atX, atY) {
  const body = ENEMY_KINDS[kind];
  let x = atX;
  let y = atY;
  if (x === undefined) {
    // Come in from a random point on the rim, never right on top of the ship.
    const angle = between(state.random, 0, Math.PI * 2);
    const radius = 430;
    x = state.core.x + Math.cos(angle) * radius;
    y = state.core.y + Math.sin(angle) * radius;
  }
  const dx = state.core.x - x;
  const dy = state.core.y - y;
  const length = Math.hypot(dx, dy) || 1;
  state.enemies.push({
    kind,
    x,
    y,
    vx: (dx / length) * body.speed * waveSpeed(state),
    vy: (dy / length) * body.speed * waveSpeed(state),
    hp: body.hp,
    maxHp: body.hp,
    radius: body.radius,
    points: body.points,
    damage: body.damage,
    phase: between(state.random, 0, Math.PI * 2),
    wobble: between(state.random, 0.7, 1.5),
    hitFlash: 0,
    born: state.time,
  });
}

/** Fire the ship's shot (or shots) toward its aim. */
function fire(state) {
  const ship = state.ship;
  const count = ship.shots;
  const spread = ship.spread;
  for (let index = 0; index < count; index += 1) {
    const offset = count === 1 ? 0 : (index - (count - 1) / 2) * spread;
    const angle = ship.aim + offset;
    state.bullets.push({
      x: ship.x + Math.cos(angle) * (ship.radius + 4),
      y: ship.y + Math.sin(angle) * (ship.radius + 4),
      vx: Math.cos(angle) * ship.bulletSpeed,
      vy: Math.sin(angle) * ship.bulletSpeed,
      radius: ship.bulletRadius,
      damage: ship.damage,
      pierce: ship.pierce,
      life: BULLET.life,
      hits: 0,
    });
  }
  state.shotsFired += count;
}

/** A short-lived spark, for hits and deaths. */
function burst(state, x, y, colour, count, speed) {
  for (let index = 0; index < count; index += 1) {
    const angle = between(state.random, 0, Math.PI * 2);
    const power = between(state.random, speed * 0.35, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power,
      life: between(state.random, 0.25, 0.6),
      maxLife: 0.6,
      colour,
      size: between(state.random, 1.5, 3.5),
    });
  }
}

/** Kill an enemy: score it, split it if it splits, and spark. */
function killEnemy(state, enemy) {
  const body = ENEMY_KINDS[enemy.kind];
  state.combo = Math.min(COMBO.max, state.combo + 1);
  state.comboTimer = COMBO.window;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.score += Math.round(body.points * (1 + (state.combo - 1) * 0.25));
  state.kills += 1;
  burst(state, enemy.x, enemy.y, body.colour, enemy.kind === KIND_BRUTE ? 22 : 10, 190);
  if (enemy.kind === KIND_SPLITTER) {
    for (let index = 0; index < 2; index += 1) {
      const angle = between(state.random, 0, Math.PI * 2);
      spawnEnemy(state, KIND_DRIFTER, enemy.x + Math.cos(angle) * 18, enemy.y + Math.sin(angle) * 18);
      state.waveTotal += 1;
      state.waveLeft += 1;
    }
  }
}

/**
 * Advance the run by one fixed step. `move` is the ship's input vector, `aim` the pointer in arena
 * coordinates, `firing` whether the fire button is held. Returns the EVENT_* flags of this step.
 */
export function step(state, move, aim, firing) {
  if (state.over || state.won) return 0;
  let events = 0;
  state.time += STEP;

  // --- the ship -------------------------------------------------------------------------------
  const ship = state.ship;
  if (aim) {
    const dx = aim.x - ship.x;
    const dy = aim.y - ship.y;
    if (dx * dx + dy * dy > 4) ship.aim = Math.atan2(dy, dx);
  }
  if (move) {
    const length = Math.hypot(move.x, move.y) || 1;
    ship.x += (move.x / length) * ship.speed * STEP;
    ship.y += (move.y / length) * ship.speed * STEP;
  }
  // The ship is leashed to the core: it can never leave the arena or hide in a corner.
  const leashX = ship.x - state.core.x;
  const leashY = ship.y - state.core.y;
  const leash = Math.hypot(leashX, leashY);
  if (leash > PLAYER.leash) {
    ship.x = state.core.x + (leashX / leash) * PLAYER.leash;
    ship.y = state.core.y + (leashY / leash) * PLAYER.leash;
  }
  ship.x = Math.max(ship.radius, Math.min(FIELD.width - ship.radius, ship.x));
  ship.y = Math.max(ship.radius, Math.min(FIELD.height - ship.radius, ship.y));

  ship.cooldown -= STEP;
  if (firing && ship.cooldown <= 0) {
    fire(state);
    ship.cooldown = ship.fireInterval;
  }

  // --- the drones -----------------------------------------------------------------------------
  state.droneAngle += STEP * 1.6;
  if (state.drones > 0) {
    state.droneClock = (state.droneClock ?? 0) - STEP;
    if (state.droneClock <= 0) {
      state.droneClock = 0.55;
      for (let index = 0; index < state.drones; index += 1) {
        const angle = state.droneAngle + (index / state.drones) * Math.PI * 2;
        const x = state.core.x + Math.cos(angle) * 96;
        const y = state.core.y + Math.sin(angle) * 96;
        let target = null;
        let best = Infinity;
        for (const enemy of state.enemies) {
          const distance = Math.hypot(enemy.x - x, enemy.y - y);
          if (distance < best) {
            best = distance;
            target = enemy;
          }
        }
        if (target) {
          const shotAngle = Math.atan2(target.y - y, target.x - x);
          state.bullets.push({
            x,
            y,
            vx: Math.cos(shotAngle) * 620,
            vy: Math.sin(shotAngle) * 620,
            radius: 3,
            damage: 1,
            pierce: 0,
            life: 1.2,
            hits: 0,
          });
        }
      }
    }
  }

  // --- the bullets ----------------------------------------------------------------------------
  for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = state.bullets[index];
    bullet.x += bullet.vx * STEP;
    bullet.y += bullet.vy * STEP;
    bullet.life -= STEP;
    if (
      bullet.life <= 0 ||
      bullet.x < -20 ||
      bullet.x > FIELD.width + 20 ||
      bullet.y < -20 ||
      bullet.y > FIELD.height + 20
    ) {
      state.bullets.splice(index, 1);
      continue;
    }
    for (let other = state.enemies.length - 1; other >= 0; other -= 1) {
      const enemy = state.enemies[other];
      const reach = enemy.radius + bullet.radius;
      const dx = enemy.x - bullet.x;
      const dy = enemy.y - bullet.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      enemy.hp -= bullet.damage;
      enemy.hitFlash = 0.12;
      state.shotsHit += 1;
      burst(state, bullet.x, bullet.y, 'bullet', 3, 90);
      if (enemy.hp <= 0) {
        killEnemy(state, enemy);
        state.enemies.splice(other, 1);
        state.waveLeft = Math.max(0, state.waveLeft - 1);
      }
      if (bullet.hits >= bullet.pierce) {
        state.bullets.splice(index, 1);
        break;
      }
      bullet.hits += 1;
    }
  }

  // --- the enemies ----------------------------------------------------------------------------
  const slow = 1 - state.slowField;
  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];
    enemy.hitFlash = Math.max(0, enemy.hitFlash - STEP);
    let vx = enemy.vx;
    let vy = enemy.vy;
    if (enemy.kind === KIND_WEAVER) {
      // Weavers swing across their own heading, so a straight line of fire misses them.
      const angle = Math.atan2(vy, vx) + Math.PI / 2;
      const swing = Math.sin(state.time * enemy.wobble * 2.4 + enemy.phase) * 78;
      vx += Math.cos(angle) * swing;
      vy += Math.sin(angle) * swing;
    }
    const distanceToCore = Math.hypot(enemy.x - state.core.x, enemy.y - state.core.y);
    const near = distanceToCore < 190 ? slow : 1;
    enemy.x += vx * STEP * near;
    enemy.y += vy * STEP * near;

    // Reaching the core costs it integrity and destroys the enemy.
    if (distanceToCore < state.core.radius + enemy.radius) {
      state.core.integrity = Math.max(0, state.core.integrity - enemy.damage);
      burst(state, enemy.x, enemy.y, 'core', 14, 210);
      state.enemies.splice(index, 1);
      state.waveLeft = Math.max(0, state.waveLeft - 1);
      events |= EVENT_HIT;
      if (state.core.integrity <= 0) {
        state.over = true;
        return events | EVENT_OVER;
      }
      continue;
    }
    // The ship is not a target: enemies only ever go for the core, so the player's skill is
    // positioning and aim, never dodging a bullet-hell.
  }

  // --- the particles --------------------------------------------------------------------------
  for (let index = state.particles.length - 1; index >= 0; index -= 1) {
    const particle = state.particles[index];
    particle.x += particle.vx * STEP;
    particle.y += particle.vy * STEP;
    particle.vx *= 0.94;
    particle.vy *= 0.94;
    particle.life -= STEP;
    if (particle.life <= 0) state.particles.splice(index, 1);
  }

  // --- the combo ------------------------------------------------------------------------------
  if (state.comboTimer > 0) {
    state.comboTimer -= STEP;
    if (state.comboTimer <= 0) state.combo = 0;
  }

  // --- the wave -------------------------------------------------------------------------------
  if (!state.intermission) {
    state.spawnClock += STEP;
    while (state.queue.length > 0 && state.queue[0].at <= state.spawnClock) {
      spawnEnemy(state, state.queue.shift().type);
    }
    if (state.queue.length === 0 && state.enemies.length === 0) {
      state.waveCleared = state.wave + 1;
      if (state.wave + 1 >= WAVES) {
        state.won = true;
        return events | EVENT_WIN;
      }
      state.intermission = true;
      events |= EVENT_WAVE;
    }
  }

  return events;
}

/** Start the next wave after an intermission. */
export function beginWave(state) {
  state.intermission = false;
  state.intermissionLeft = 0;
  state.offers = [];
  resetWave(state, state.wave + 1);
}

/** The run's accuracy, as a percentage, for the results screen. */
export function accuracy(state) {
  if (state.shotsFired === 0) return 0;
  return Math.round((state.shotsHit / state.shotsFired) * 100);
}

/** A short grade for the results screen, from the score and the core's integrity. */
export function grade(state) {
  if (state.won) return state.core.integrity > 60 ? 'S' : state.core.integrity > 30 ? 'A' : 'B';
  if (state.waveCleared >= 7) return 'C';
  if (state.waveCleared >= 4) return 'D';
  return 'E';
}

export { intBetween };
