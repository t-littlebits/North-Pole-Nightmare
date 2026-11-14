// Arenas are cosmetic: a different look, same rules. One is picked at random for every run.
export const ARENAS = {
  village: { id: 'village', name: "Santa's Village", ground: 'ground', border: 'tree', scatter: ['snowpile', 'cane_post', 'lamp'], flake: 0xffffff, spark: 0xfff6b0, bg: '#0e1630' },
  lake: { id: 'lake', name: 'Frozen Lake', ground: 'ground_lake', border: 'crystal', scatter: ['iceblock', 'crystal', 'snowpile'], flake: 0xbfefff, spark: 0xbff4ff, bg: '#0a1c3a' },
  candy: { id: 'candy', name: 'Gingerbread Town', ground: 'ground_candy', border: 'lolli', scatter: ['gingerhouse', 'lollipop', 'snowpile'], flake: 0xffd1ea, spark: 0xffe3f3, bg: '#2a1530' },
  workshop: { id: 'workshop', name: "Santa's Workshop", ground: 'ground_workshop', border: 'crate', scatter: ['toybox', 'candle', 'crate'], flake: 0xc9b8ff, spark: 0xffd27a, bg: '#0b0a18' }
};
export const ARENA_IDS = Object.keys(ARENAS);
export const randomArena = (rng = Math.random) => ARENA_IDS[Math.floor(rng() * ARENA_IDS.length)];
