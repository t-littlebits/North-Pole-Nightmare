// Playable arenas. Each changes the look, the rules of movement or the enemy mix.
// Unlocked by reaching `unlockWave` in any previous run (server-checked against best_wave).
export const ARENAS = {
  village: {
    id: 'village', name: "Santa's Village", unlockWave: 0, ground: 'ground', border: 'tree', scatter: ['snowpile', 'cane_post', 'lamp'],
    blurb: 'The classic. Snowy streets and twinkling trees.', mechanic: 'No tricks. Pure survival.',
    ice: false, sticky: 0, bias: {}, ghostFrom: null, xpBonus: 1, dark: 0, flake: 0xffffff, spark: 0xfff6b0, bg: '#0e1630'
  },
  lake: {
    id: 'lake', name: 'Frozen Lake', unlockWave: 5, ground: 'ground_lake', border: 'crystal', scatter: ['iceblock', 'crystal', 'snowpile'],
    blurb: 'A mirror of black ice under the aurora.', mechanic: 'Slippery ice: you slide when you turn. Snowmen and reindeer love it here.',
    ice: true, sticky: 0, bias: { snowman: 1.7, reindeer: 1.6 }, ghostFrom: null, xpBonus: 1, dark: 0, flake: 0xbfefff, spark: 0xbff4ff, bg: '#0a1c3a'
  },
  candy: {
    id: 'candy', name: 'Gingerbread Town', unlockWave: 8, ground: 'ground_candy', border: 'lolli', scatter: ['gingerhouse', 'lollipop', 'snowpile'],
    blurb: 'Sugar-frosted streets. The residents are not friendly.', mechanic: 'Sticky syrup puddles slow you down. Gingerbread monsters are everywhere.',
    ice: false, sticky: 16, bias: { gingerbread: 2.4 }, ghostFrom: null, xpBonus: 1, dark: 0, flake: 0xffd1ea, spark: 0xffe3f3, bg: '#2a1530'
  },
  workshop: {
    id: 'workshop', name: 'Haunted Workshop', unlockWave: 12, ground: 'ground_workshop', border: 'crate', scatter: ['toybox', 'candle', 'crate'],
    blurb: "Santa's workshop after the lights went out.", mechanic: 'Ghosts from the very first wave, flickering lights, and gems are worth 25% more.',
    ice: false, sticky: 0, bias: { ghost: 3.2 }, ghostFrom: 1, xpBonus: 1.25, dark: 0.32, flake: 0xc9b8ff, spark: 0xffd27a, bg: '#0b0a18'
  }
};
export const ARENA_IDS = Object.keys(ARENAS);
export const arenaUnlocked = (id, bestWave) => !!ARENAS[id] && (bestWave || 0) >= ARENAS[id].unlockWave;
