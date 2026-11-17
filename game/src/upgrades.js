// The upgrade pool offered between waves. Each card changes the ship or the arena for the rest of
// the run, so the choices compound: a run built on fire rate plays nothing like one built on
// piercing slugs. Three distinct cards are drawn each intermission.

export const UPGRADES = [
  {
    id: 'overclock',
    name: 'Overclock',
    blurb: 'Fire 22% faster',
    apply(ship) {
      ship.fireInterval = Math.max(0.055, ship.fireInterval * 0.78);
    },
  },
  {
    id: 'hardrounds',
    name: 'Hard Rounds',
    blurb: '+1 damage per shot',
    apply(ship) {
      ship.damage += 1;
    },
  },
  {
    id: 'splitbarrel',
    name: 'Split Barrel',
    blurb: '+1 projectile per shot',
    apply(ship) {
      ship.shots += 1;
    },
  },
  {
    id: 'piercer',
    name: 'Piercer',
    blurb: 'Shots pass through one more enemy',
    apply(ship) {
      ship.pierce += 1;
    },
  },
  {
    id: 'raislug',
    name: 'Rail Slug',
    blurb: '+25% bullet speed and reach',
    apply(ship) {
      ship.bulletSpeed *= 1.25;
    },
  },
  {
    id: 'coreweld',
    name: 'Core Weld',
    blurb: 'Repair 30 core integrity',
    apply(ship, state) {
      state.core.integrity = Math.min(state.core.max, state.core.integrity + 30);
    },
  },
  {
    id: 'sentinel',
    name: 'Sentinel Drone',
    blurb: 'A drone orbits the core and fires',
    apply(ship, state) {
      state.drones += 1;
    },
  },
  {
    id: 'gravitywell',
    name: 'Gravity Well',
    blurb: 'Enemies near the core move 25% slower',
    apply(ship, state) {
      state.slowField = Math.min(0.6, state.slowField + 0.25);
    },
  },
];

/**
 * Draw `count` distinct cards with the run's generator. Cards already taken to their cap are left
 * out, so a late intermission never offers a dead choice.
 */
export function drawUpgrades(random, state, count) {
  const taken = state.takenUpgrades;
  const pool = UPGRADES.filter((card) => {
    if (card.id === 'coreweld') return state.core.integrity < state.core.max;
    if (card.id === 'sentinel') return state.drones < 3;
    if (card.id === 'gravitywell') return state.slowField < 0.6;
    if (card.id === 'piercer') return state.ship.pierce < 4;
    if (card.id === 'splitbarrel') return state.ship.shots < 5;
    if (card.id === 'overclock') return state.ship.fireInterval > 0.06;
    return (taken[card.id] ?? 0) < 6;
  });
  const drawn = [];
  const bag = pool.slice();
  while (drawn.length < count && bag.length > 0) {
    const index = Math.floor(random() * bag.length) % bag.length;
    drawn.push(bag.splice(index, 1)[0]);
  }
  return drawn;
}

/** Apply a card to the run and record that it was taken. */
export function takeUpgrade(state, card) {
  card.apply(state.ship, state);
  state.takenUpgrades[card.id] = (state.takenUpgrades[card.id] ?? 0) + 1;
  state.upgradeLog.push(card.name);
}
