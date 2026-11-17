// The ten waves, as data. Each wave lists groups of enemies with when the group starts, how many it
// holds and the gap between them; buildQueue turns that into one ordered list of timed spawns, so
// the simulation only ever has to look at the front of a queue.
//
// The gaps are deliberately short: an enemy takes several seconds to cross the arena, so a wave
// only feels like a wave when the spawns overlap and the arena fills up.

export const WAVE_TABLE = [
  {
    label: 'PROBE',
    groups: [{ type: 'drifter', count: 14, gap: 0.3, start: 0.4 }],
  },
  {
    label: 'SWARM',
    groups: [
      { type: 'drifter', count: 18, gap: 0.24, start: 0.3 },
      { type: 'runner', count: 8, gap: 0.4, start: 1.6 },
    ],
  },
  {
    label: 'WEAVE',
    groups: [
      { type: 'weaver', count: 14, gap: 0.32, start: 0.3 },
      { type: 'drifter', count: 12, gap: 0.26, start: 1.2 },
    ],
  },
  {
    label: 'PRESSURE',
    groups: [
      { type: 'runner', count: 20, gap: 0.2, start: 0.3 },
      { type: 'brute', count: 2, gap: 1.2, start: 1.0 },
    ],
  },
  {
    label: 'FRACTURE',
    groups: [
      { type: 'splitter', count: 12, gap: 0.4, start: 0.3 },
      { type: 'drifter', count: 16, gap: 0.22, start: 1.4 },
    ],
  },
  {
    label: 'CROSSFIRE',
    groups: [
      { type: 'weaver', count: 16, gap: 0.26, start: 0.3 },
      { type: 'runner', count: 16, gap: 0.22, start: 1.2 },
    ],
  },
  {
    label: 'BULWARK',
    groups: [
      { type: 'brute', count: 5, gap: 1.1, start: 0.4 },
      { type: 'drifter', count: 22, gap: 0.2, start: 0.8 },
    ],
  },
  {
    label: 'SHATTER',
    groups: [
      { type: 'splitter', count: 16, gap: 0.32, start: 0.3 },
      { type: 'weaver', count: 16, gap: 0.24, start: 1.0 },
    ],
  },
  {
    label: 'ONSLAUGHT',
    groups: [
      { type: 'runner', count: 24, gap: 0.16, start: 0.2 },
      { type: 'brute', count: 4, gap: 1.0, start: 0.8 },
      { type: 'splitter', count: 10, gap: 0.5, start: 1.8 },
    ],
  },
  {
    label: 'NULLPOINT',
    groups: [
      { type: 'brute', count: 6, gap: 0.9, start: 0.3 },
      { type: 'weaver', count: 20, gap: 0.2, start: 0.6 },
      { type: 'runner', count: 24, gap: 0.16, start: 1.2 },
      { type: 'splitter', count: 12, gap: 0.4, start: 2.2 },
    ],
  },
];

/** The wave's spawns as one list of { at, type }, sorted by time. */
export function buildQueue(waveIndex) {
  const wave = WAVE_TABLE[Math.min(waveIndex, WAVE_TABLE.length - 1)];
  const queue = [];
  for (const group of wave.groups) {
    for (let index = 0; index < group.count; index += 1) {
      queue.push({ at: group.start + index * group.gap, type: group.type });
    }
  }
  queue.sort((a, b) => a.at - b.at);
  return queue;
}

/** The wave's name, for the HUD. */
export function waveLabel(waveIndex) {
  return WAVE_TABLE[Math.min(waveIndex, WAVE_TABLE.length - 1)].label;
}

/** How many enemies the wave will send, for the HUD's remaining count. */
export function waveSize(waveIndex) {
  return buildQueue(waveIndex).length;
}
