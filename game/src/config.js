// Every tuning number and colour in one place. The arena is a fixed 1280x720 logical area; the
// renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The core you defend. Its integrity is the only life in the game. */
export const CORE = { x: 640, y: 360, radius: 46, integrity: 100 };

export const PLAYER = {
  radius: 15,
  speed: 430,
  fireInterval: 0.17,
  bulletSpeed: 880,
  bulletRadius: 4,
  damage: 1,
  pierce: 0,
  shots: 1,
  spread: 0.11,
  /** How far from the core the ship may roam, so it can never leave the arena. */
  leash: 300,
};

export const BULLET = { life: 1.5 };

/**
 * Kills in quick succession raise a multiplier that decays when you stop scoring.
 * `window` is how long a kill keeps the chain alive; `max` caps the multiplier so a
 * long chain cannot run away with the score.
 */
export const COMBO = { window: 2.6, max: 8 };

/** Waves to clear before the core is secured. */
export const WAVES = 10;

/** How long the upgrade cards stay up before the next wave starts on its own. */
export const INTERMISSION = { seconds: 14 };

export const PALETTE = {
  backdrop: '#070a12',
  grid: '#121a2b',
  gridBright: '#1b2740',
  core: '#ffd166',
  coreDim: '#7a5f22',
  player: '#6ef3ff',
  bullet: '#c8f9ff',
  drifter: '#ff5c7a',
  runner: '#ffa94d',
  brute: '#a78bfa',
  weaver: '#4ade80',
  splitter: '#f472b6',
  text: '#eaf2ff',
  muted: '#7d8aa3',
  panel: '#0d1422',
  good: '#4ade80',
  bad: '#ff5c7a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'nullpoint.best';
