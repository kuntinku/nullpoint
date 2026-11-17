// The renderer: everything the player sees, drawn on one canvas at a fixed 1280x720 logical size
// and scaled to the window. It reads the simulation's state and never changes it, so a screenshot
// scene can paint a frame without disturbing the run.
import { CORE, FIELD, FONT, MONO, PALETTE, WAVES } from './config.js';
import { ENEMY_KINDS, accuracy, grade } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_INTERMISSION = 'intermission';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const W = FIELD.width;
const H = FIELD.height;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || W;
    const height = canvas.clientHeight || H;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    scale = Math.min(canvas.width / W, canvas.height / H);
    offsetX = (canvas.width - W * scale) / 2;
    offsetY = (canvas.height - H * scale) / 2;
  }

  window.addEventListener('resize', resize);
  resize();

  // --- small drawing helpers ------------------------------------------------------------------

  function text(value, x, y, size, colour, align = 'left', weight = '600', family = FONT) {
    context.font = `${weight} ${size}px ${family}`;
    context.fillStyle = colour;
    context.textAlign = align;
    context.textBaseline = 'middle';
    context.fillText(value, x, y);
  }

  function spaced(value, x, y, size, colour, spacing, align = 'center') {
    context.font = `700 ${size}px ${FONT}`;
    context.fillStyle = colour;
    context.textBaseline = 'middle';
    const letters = [...value];
    const widths = letters.map((letter) => context.measureText(letter).width + spacing);
    const total = widths.reduce((sum, width) => sum + width, 0) - spacing;
    let cursor = align === 'center' ? x - total / 2 : x;
    context.textAlign = 'left';
    for (let index = 0; index < letters.length; index += 1) {
      context.fillText(letters[index], cursor, y);
      cursor += widths[index];
    }
  }

  function roundRect(x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function panel(x, y, width, height, alpha = 0.86) {
    context.save();
    roundRect(x, y, width, height, 18);
    context.fillStyle = `rgba(9, 14, 24, ${alpha})`;
    context.fill();
    context.strokeStyle = 'rgba(110, 243, 255, 0.22)';
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }

  // --- the arena ------------------------------------------------------------------------------

  function drawArena(state) {
    const gradient = context.createRadialGradient(CORE.x, CORE.y, 40, CORE.x, CORE.y, 760);
    gradient.addColorStop(0, '#101a2e');
    gradient.addColorStop(0.55, '#0a1020');
    gradient.addColorStop(1, PALETTE.backdrop);
    context.fillStyle = gradient;
    context.fillRect(0, 0, W, H);

    // A faint polar grid, so movement and distance read at a glance.
    context.save();
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    for (let radius = 90; radius <= 620; radius += 90) {
      context.beginPath();
      context.arc(CORE.x, CORE.y, radius, 0, Math.PI * 2);
      context.stroke();
    }
    for (let spoke = 0; spoke < 12; spoke += 1) {
      const angle = (spoke / 12) * Math.PI * 2;
      context.beginPath();
      context.moveTo(CORE.x + Math.cos(angle) * 70, CORE.y + Math.sin(angle) * 70);
      context.lineTo(CORE.x + Math.cos(angle) * 640, CORE.y + Math.sin(angle) * 640);
      context.stroke();
    }
    context.restore();

    // The leash ring: where the ship may go.
    context.save();
    context.setLineDash([6, 10]);
    context.strokeStyle = 'rgba(110, 243, 255, 0.13)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(CORE.x, CORE.y, 300, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    // The slow field, when the run has one.
    if (state.slowField > 0) {
      const field = context.createRadialGradient(CORE.x, CORE.y, 40, CORE.x, CORE.y, 200);
      field.addColorStop(0, 'rgba(74, 222, 128, 0.10)');
      field.addColorStop(1, 'rgba(74, 222, 128, 0)');
      context.fillStyle = field;
      context.beginPath();
      context.arc(CORE.x, CORE.y, 200, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCore(state) {
    const core = state.core;
    const health = core.integrity / core.max;
    const colour = health > 0.6 ? PALETTE.core : health > 0.3 ? '#ffa94d' : PALETTE.bad;
    const pulse = 1 + Math.sin(state.time * 2.4) * 0.03;

    context.save();
    context.shadowColor = colour;
    context.shadowBlur = 34;
    context.strokeStyle = colour;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(core.x, core.y, core.radius * pulse, 0, Math.PI * 2);
    context.stroke();

    context.shadowBlur = 18;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(core.x, core.y, core.radius * 0.62, 0, Math.PI * 2);
    context.stroke();

    // The integrity arc, drawn over the ring.
    context.shadowBlur = 0;
    context.strokeStyle = colour;
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.beginPath();
    context.arc(core.x, core.y, core.radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health);
    context.stroke();
    context.restore();

    // The core's own glow.
    const glow = context.createRadialGradient(core.x, core.y, 0, core.x, core.y, core.radius);
    glow.addColorStop(0, 'rgba(255, 209, 102, 0.55)');
    glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(core.x, core.y, core.radius, 0, Math.PI * 2);
    context.fill();

    text(`${Math.ceil(core.integrity)}`, core.x, core.y + 1, 26, '#1a1206', 'center', '800', MONO);
  }

  function drawDrones(state) {
    for (let index = 0; index < state.drones; index += 1) {
      const angle = state.droneAngle + (index / state.drones) * Math.PI * 2;
      const x = state.core.x + Math.cos(angle) * 96;
      const y = state.core.y + Math.sin(angle) * 96;
      context.save();
      context.shadowColor = PALETTE.good;
      context.shadowBlur = 14;
      context.fillStyle = PALETTE.good;
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      const body = ENEMY_KINDS[enemy.kind];
      const colour = PALETTE[body.colour];
      const flash = enemy.hitFlash > 0;
      context.save();
      context.translate(enemy.x, enemy.y);
      context.shadowColor = colour;
      context.shadowBlur = flash ? 26 : 14;
      context.strokeStyle = flash ? '#ffffff' : colour;
      context.fillStyle = flash ? 'rgba(255,255,255,0.35)' : 'rgba(10, 16, 28, 0.72)';
      context.lineWidth = 2.5;

      if (enemy.kind === 'brute') {
        // A heavy hexagon, with its hit points as an inner ring.
        context.beginPath();
        for (let side = 0; side < 6; side += 1) {
          const angle = (side / 6) * Math.PI * 2 + Math.PI / 6;
          const x = Math.cos(angle) * enemy.radius;
          const y = Math.sin(angle) * enemy.radius;
          if (side === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(0, 0, enemy.radius * 0.45, 0, Math.PI * 2);
        context.stroke();
      } else if (enemy.kind === 'runner') {
        // A sharp dart, pointing where it is going.
        const angle = Math.atan2(enemy.vy, enemy.vx);
        context.rotate(angle);
        context.beginPath();
        context.moveTo(enemy.radius, 0);
        context.lineTo(-enemy.radius * 0.8, enemy.radius * 0.75);
        context.lineTo(-enemy.radius * 0.35, 0);
        context.lineTo(-enemy.radius * 0.8, -enemy.radius * 0.75);
        context.closePath();
        context.fill();
        context.stroke();
      } else if (enemy.kind === 'weaver') {
        // A diamond with a cross through it.
        context.rotate(state.time * 1.4 + enemy.phase);
        context.beginPath();
        context.moveTo(0, -enemy.radius);
        context.lineTo(enemy.radius, 0);
        context.lineTo(0, enemy.radius);
        context.lineTo(-enemy.radius, 0);
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.moveTo(-enemy.radius * 0.5, 0);
        context.lineTo(enemy.radius * 0.5, 0);
        context.stroke();
      } else if (enemy.kind === 'splitter') {
        // A ring with two inner lobes: it is about to come apart.
        context.beginPath();
        context.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(-enemy.radius * 0.35, 0, enemy.radius * 0.3, 0, Math.PI * 2);
        context.arc(enemy.radius * 0.35, 0, enemy.radius * 0.3, 0, Math.PI * 2);
        context.stroke();
      } else {
        // A drifter: a soft blob with a bright rim.
        context.beginPath();
        context.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(0, 0, enemy.radius * 0.4, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();

      // A damage bar over anything that takes more than one hit.
      if (enemy.maxHp > 2 && enemy.hp < enemy.maxHp) {
        const width = enemy.radius * 2;
        const left = enemy.x - enemy.radius;
        const top = enemy.y - enemy.radius - 10;
        context.fillStyle = 'rgba(0,0,0,0.55)';
        context.fillRect(left, top, width, 3);
        context.fillStyle = colour;
        context.fillRect(left, top, width * (enemy.hp / enemy.maxHp), 3);
      }
    }
  }

  function drawBullets(state) {
    context.save();
    context.shadowColor = PALETTE.bullet;
    context.shadowBlur = 12;
    context.fillStyle = PALETTE.bullet;
    for (const bullet of state.bullets) {
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawParticles(state) {
    for (const particle of state.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      context.globalAlpha = alpha;
      context.fillStyle =
        particle.colour === 'core'
          ? PALETTE.core
          : particle.colour === 'bullet'
            ? PALETTE.bullet
            : PALETTE[particle.colour] ?? PALETTE.text;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawShip(state) {
    const ship = state.ship;
    context.save();
    context.translate(ship.x, ship.y);
    context.rotate(ship.aim);
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 20;
    context.strokeStyle = PALETTE.player;
    context.fillStyle = 'rgba(110, 243, 255, 0.18)';
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(ship.radius + 6, 0);
    context.lineTo(-ship.radius * 0.7, ship.radius * 0.85);
    context.lineTo(-ship.radius * 0.25, 0);
    context.lineTo(-ship.radius * 0.7, -ship.radius * 0.85);
    context.closePath();
    context.fill();
    context.stroke();
    context.restore();

    // The aim line, so the player always knows where the next shot goes.
    context.save();
    context.setLineDash([4, 8]);
    context.strokeStyle = 'rgba(110, 243, 255, 0.28)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(ship.x + Math.cos(ship.aim) * 22, ship.y + Math.sin(ship.aim) * 22);
    context.lineTo(ship.x + Math.cos(ship.aim) * 150, ship.y + Math.sin(ship.aim) * 150);
    context.stroke();
    context.restore();
  }

  // --- the HUD --------------------------------------------------------------------------------

  function drawHud(state) {
    // Top left: the wave and what is left of it.
    panel(24, 20, 300, 84, 0.72);
    text('WAVE', 44, 44, 12, PALETTE.muted, 'left', '700');
    text(`${Math.min(state.wave + 1, WAVES)} / ${WAVES}`, 44, 70, 26, PALETTE.text, 'left', '800', MONO);
    text(state.waveLabel, 44, 92, 12, PALETTE.player, 'left', '700');
    text('HOSTILES', 200, 44, 12, PALETTE.muted, 'left', '700');
    text(`${state.waveLeft}`, 200, 70, 26, state.waveLeft > 0 ? PALETTE.text : PALETTE.good, 'left', '800', MONO);
    text('LEFT', 200, 92, 12, PALETTE.muted, 'left', '700');

    // Top right: the score and the combo.
    panel(W - 324, 20, 300, 84, 0.72);
    text('SCORE', W - 304, 44, 12, PALETTE.muted, 'left', '700');
    text(`${state.score}`, W - 304, 70, 26, PALETTE.text, 'left', '800', MONO);
    text('COMBO', W - 150, 44, 12, PALETTE.muted, 'left', '700');
    const comboColour = state.combo > 1 ? PALETTE.core : PALETTE.muted;
    text(`x${Math.max(1, state.combo)}`, W - 150, 70, 26, comboColour, 'left', '800', MONO);
    if (state.combo > 1) {
      const width = 90 * (state.comboTimer / 2.6);
      context.fillStyle = 'rgba(255, 209, 102, 0.25)';
      context.fillRect(W - 150, 88, 90, 3);
      context.fillStyle = PALETTE.core;
      context.fillRect(W - 150, 88, width, 3);
    }

    // Bottom left: the core's integrity, as a bar and a number.
    panel(24, H - 104, 340, 80, 0.72);
    const health = state.core.integrity / state.core.max;
    const colour = health > 0.6 ? PALETTE.good : health > 0.3 ? '#ffa94d' : PALETTE.bad;
    text('CORE INTEGRITY', 44, H - 80, 12, PALETTE.muted, 'left', '700');
    text(`${Math.ceil(state.core.integrity)}%`, 344, H - 80, 14, colour, 'right', '800', MONO);
    context.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(44, H - 62, 300, 12, 6);
    context.fill();
    context.fillStyle = colour;
    roundRect(44, H - 62, Math.max(2, 300 * health), 12, 6);
    context.fill();

    // Bottom right: the run's build, so the upgrades are visible while playing.
    panel(W - 324, H - 104, 300, 80, 0.72);
    text('BUILD', W - 304, H - 80, 12, PALETTE.muted, 'left', '700');
    const build = state.upgradeLog.length === 0 ? 'stock ship' : state.upgradeLog.slice(-3).join(' · ');
    text(build, W - 304, H - 58, 13, PALETTE.text, 'left', '600');
    text(`DMG ${state.ship.damage}  RATE ${(1 / state.ship.fireInterval).toFixed(1)}/s  SHOTS ${state.ship.shots}`, W - 304, H - 38, 11, PALETTE.muted, 'left', '600', MONO);
  }

  // --- the screens ----------------------------------------------------------------------------

  function drawTitle(state) {
    context.fillStyle = 'rgba(4, 7, 13, 0.72)';
    context.fillRect(0, 0, W, H);

    spaced('NULLPOINT', W / 2, 196, 84, PALETTE.text, 14);
    context.save();
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 26;
    context.strokeStyle = PALETTE.player;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(W / 2 - 250, 250);
    context.lineTo(W / 2 + 250, 250);
    context.stroke();
    context.restore();
    text('Hold the core. Ten waves. One ship.', W / 2, 288, 20, PALETTE.muted, 'center', '500');

    panel(W / 2 - 330, 336, 660, 176, 0.8);
    text('HOW TO PLAY', W / 2, 366, 12, PALETTE.player, 'center', '800');
    const rows = [
      ['WASD / ARROWS', 'fly the ship around the core'],
      ['MOUSE', 'aim · HOLD LEFT BUTTON to fire'],
      ['1 2 3', 'pick an upgrade between waves'],
      ['P', 'pause · R restarts after a run'],
    ];
    rows.forEach((row, index) => {
      const y = 400 + index * 28;
      text(row[0], W / 2 - 300, y, 14, PALETTE.text, 'left', '700', MONO);
      text(row[1], W / 2 - 130, y, 14, PALETTE.muted, 'left', '500');
    });

    const blink = 0.55 + Math.sin(state.time * 3.4) * 0.45;
    context.globalAlpha = blink;
    text('PRESS SPACE OR CLICK TO DEPLOY', W / 2, 566, 20, PALETTE.core, 'center', '800');
    context.globalAlpha = 1;
    text('Enemies only ever go for the core — you are the gun, not the target.', W / 2, 620, 13, PALETTE.muted, 'center', '500');
  }

  function drawIntermission(state) {
    context.fillStyle = 'rgba(4, 7, 13, 0.78)';
    context.fillRect(0, 0, W, H);

    text(`WAVE ${state.wave + 1} CLEARED`, W / 2, 96, 15, PALETTE.good, 'center', '800');
    text('CHOOSE AN UPGRADE', W / 2, 140, 40, PALETTE.text, 'center', '800');
    text('Press 1, 2 or 3 — or click a card', W / 2, 178, 15, PALETTE.muted, 'center', '500');

    const cards = state.offers;
    const width = 300;
    const gap = 30;
    const total = cards.length * width + (cards.length - 1) * gap;
    const startX = W / 2 - total / 2;
    cards.forEach((card, index) => {
      const x = startX + index * (width + gap);
      const y = 220;
      const height = 300;
      context.save();
      roundRect(x, y, width, height, 16);
      context.fillStyle = 'rgba(13, 20, 34, 0.95)';
      context.fill();
      context.strokeStyle = 'rgba(110, 243, 255, 0.35)';
      context.lineWidth = 2;
      context.stroke();
      context.restore();

      text(`${index + 1}`, x + 24, y + 34, 22, PALETTE.player, 'left', '800', MONO);
      text(card.name.toUpperCase(), x + width / 2, y + 96, 24, PALETTE.text, 'center', '800');
      context.save();
      context.strokeStyle = 'rgba(110, 243, 255, 0.2)';
      context.beginPath();
      context.moveTo(x + 40, y + 124);
      context.lineTo(x + width - 40, y + 124);
      context.stroke();
      context.restore();
      wrap(card.blurb, x + width / 2, y + 168, width - 56, 20, 15, PALETTE.muted);
      text('TAKE', x + width / 2, y + height - 34, 13, PALETTE.player, 'center', '800');
    });

    text(`Next: wave ${state.wave + 2} — ${state.wave + 2 >= WAVES ? 'the last stand' : 'it gets faster'}`, W / 2, 570, 15, PALETTE.muted, 'center', '500');
    text(`Core integrity ${Math.ceil(state.core.integrity)}%  ·  Score ${state.score}`, W / 2, 604, 15, PALETTE.text, 'center', '600', MONO);
  }

  function wrap(value, x, y, maxWidth, lineHeight, size, colour) {
    context.font = `500 ${size}px ${FONT}`;
    context.fillStyle = colour;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const words = value.split(' ');
    let line = '';
    let cursor = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        context.fillText(line, x, cursor);
        line = word;
        cursor += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) context.fillText(line, x, cursor);
  }

  function drawPaused() {
    context.fillStyle = 'rgba(4, 7, 13, 0.7)';
    context.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, H / 2 - 20, 56, PALETTE.text, 'center', '800');
    text('Press P or Escape to resume', W / 2, H / 2 + 40, 17, PALETTE.muted, 'center', '500');
  }

  function drawOver(state) {
    context.fillStyle = 'rgba(4, 7, 13, 0.8)';
    context.fillRect(0, 0, W, H);

    text('CORE BREACHED', W / 2, 132, 15, PALETTE.bad, 'center', '800');
    spaced('RUN OVER', W / 2, 196, 62, PALETTE.text, 8);
    text(`The core fell on wave ${state.wave + 1} of ${WAVES}`, W / 2, 250, 18, PALETTE.muted, 'center', '500');

    panel(W / 2 - 300, 292, 600, 190, 0.85);
    const stats = [
      ['SCORE', `${state.score}`],
      ['WAVES CLEARED', `${state.waveCleared} / ${WAVES}`],
      ['KILLS', `${state.kills}`],
      ['BEST COMBO', `x${Math.max(1, state.bestCombo)}`],
      ['ACCURACY', `${accuracy(state)}%`],
      ['GRADE', grade(state)],
    ];
    stats.forEach((row, index) => {
      const column = index % 2;
      const line = Math.floor(index / 2);
      const x = W / 2 - 260 + column * 300;
      const y = 330 + line * 44;
      text(row[0], x, y, 12, PALETTE.muted, 'left', '700');
      text(row[1], x + 240, y, 22, PALETTE.text, 'right', '800', MONO);
    });

    const blink = 0.55 + Math.sin(state.time * 3.4) * 0.45;
    context.globalAlpha = blink;
    text('PRESS R OR SPACE TO RUN IT AGAIN', W / 2, 540, 20, PALETTE.core, 'center', '800');
    context.globalAlpha = 1;
    text('Every run draws new upgrade cards — the build is the game.', W / 2, 592, 13, PALETTE.muted, 'center', '500');
  }

  function drawWin(state) {
    context.fillStyle = 'rgba(4, 7, 13, 0.8)';
    context.fillRect(0, 0, W, H);

    text('ALL TEN WAVES HELD', W / 2, 132, 15, PALETTE.good, 'center', '800');
    spaced('CORE SECURED', W / 2, 196, 58, PALETTE.text, 8);
    text('The nullpoint held. Nothing got through.', W / 2, 250, 18, PALETTE.muted, 'center', '500');

    panel(W / 2 - 300, 292, 600, 190, 0.85);
    const stats = [
      ['SCORE', `${state.score}`],
      ['CORE LEFT', `${Math.ceil(state.core.integrity)}%`],
      ['KILLS', `${state.kills}`],
      ['BEST COMBO', `x${Math.max(1, state.bestCombo)}`],
      ['ACCURACY', `${accuracy(state)}%`],
      ['GRADE', grade(state)],
    ];
    stats.forEach((row, index) => {
      const column = index % 2;
      const line = Math.floor(index / 2);
      const x = W / 2 - 260 + column * 300;
      const y = 330 + line * 44;
      text(row[0], x, y, 12, PALETTE.muted, 'left', '700');
      text(row[1], x + 240, y, 22, PALETTE.text, 'right', '800', MONO);
    });

    const blink = 0.55 + Math.sin(state.time * 3.4) * 0.45;
    context.globalAlpha = blink;
    text('PRESS R OR SPACE TO PLAY AGAIN', W / 2, 540, 20, PALETTE.core, 'center', '800');
    context.globalAlpha = 1;
    text(`Build: ${state.upgradeLog.length === 0 ? 'stock ship' : state.upgradeLog.join(' · ')}`, W / 2, 592, 13, PALETTE.muted, 'center', '500');
  }

  // --- the frame ------------------------------------------------------------------------------

  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    drawArena(state);
    drawCore(state);
    drawDrones(state);
    drawEnemies(state);
    drawBullets(state);
    drawParticles(state);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawShip(state);

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state);
    if (screen === SCREEN_TITLE) drawTitle(state);
    if (screen === SCREEN_INTERMISSION) {
      drawHud(state);
      drawIntermission(state);
    }
    if (screen === SCREEN_PAUSED) drawPaused();
    if (screen === SCREEN_OVER) drawOver(state);
    if (screen === SCREEN_WIN) drawWin(state);

    if (best > 0 && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      text(`BEST ${best}`, W - 24, H - 24, 12, PALETTE.muted, 'right', '700', MONO);
    }
  }

  return { draw, resize };
}
