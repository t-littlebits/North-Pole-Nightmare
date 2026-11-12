// Static game catalog: characters, weapons, skins, enemies, bosses.
// Pure data (no browser APIs) so Netlify Functions can import it too.

export const WAVE_SECONDS = 30;
export const MAX_WEAPON_LEVEL = 8;

export const CHARACTERS = {
  santa: {
    id: 'santa', name: 'Santa', hp: 120, speed: 150, weapon: 'snowball', price: 0,
    blurb: 'Sturdy and generous. Hits hard, moves like a man who eats a lot of cookies.',
    ability: { id: 'sackslam', name: 'Sack Slam', cd: 10, desc: 'Slams the sack down: a shockwave that damages and knocks back everything nearby.' }
  },
  elf: {
    id: 'elf', name: 'Elf', hp: 80, speed: 190, weapon: 'candycane', price: 0,
    blurb: 'Fragile but fast. Has been waiting years to finally hit someone.',
    ability: { id: 'jingledash', name: 'Jingle Dash', cd: 5, desc: 'A quick invulnerable dash that damages enemies you pass through.' }
  },
  snowman: {
    id: 'snowman', name: 'Snowman', hp: 160, speed: 120, weapon: 'iceblast', price: 500,
    blurb: 'Slow, huge health pool, and utterly unbothered by the cold.',
    ability: { id: 'blizzardstorm', name: 'Blizzard Storm', cd: 16, desc: 'Summons a roaring storm around you for 5 seconds that slows and shreds enemies, then shatters in a freezing burst.' }
  },
  reindeer: {
    id: 'reindeer', name: 'Reindeer', hp: 100, speed: 170, weapon: 'bells', price: 800,
    blurb: 'Jingles constantly. Enemies hear it coming, and that is the plan.',
    ability: { id: 'rednosebeam', name: 'Red Nose Beam', cd: 12, desc: 'Your nose blazes into a sweeping beam that spins around you for 3 seconds, burning everything it touches.' }
  },
  knight: {
    id: 'knight', name: 'Gingerbread Knight', hp: 140, speed: 135, weapon: 'bomb', price: 1200,
    blurb: 'Baked for battle. Armoured in icing, armed with explosives.',
    ability: { id: 'garrison', name: 'Gingerbread Garrison', cd: 14, desc: 'Bakes three cookie soldiers that hunt down enemies for 8 seconds.' }
  }
};
export const CHARACTER_IDS = Object.keys(CHARACTERS);

export const WEAPONS = {
  snowball: { id: 'snowball', name: 'Snowballs', price: 0, blurb: 'Fires at the nearest enemy. Extra snowballs at higher levels.' },
  candycane: { id: 'candycane', name: 'Candy Canes', price: 0, blurb: 'Boomerang canes that pierce everything on the way out and back.' },
  iceblast: { id: 'iceblast', name: 'Ice Blast', price: 0, blurb: 'Frost nova around you that damages and slows.' },
  bells: { id: 'bells', name: 'Christmas Bells', price: 600, blurb: 'Golden bells orbit you and ring enemies up on contact.' },
  bomb: { id: 'bomb', name: 'Gingerbread Bombs', price: 900, blurb: 'Lobbed at enemies, explode after a short fuse.' }
};
export const DEFAULT_WEAPONS = ['snowball', 'candycane', 'iceblast'];

// Palette overrides are keyed by the single-letter palette keys used in src/game/sprites.js
export const SKINS = {
  santa_classic: { id: 'santa_classic', character: 'santa', name: 'Classic Santa', rarity: 'common', price: 0, source: 'default', palette: {} },
  santa_frost: { id: 'santa_frost', character: 'santa', name: 'Frost Santa', rarity: 'rare', price: 400, source: 'shop', palette: { R: '#3a7bd5', Y: '#9be7ff' } },
  santa_gold: { id: 'santa_gold', character: 'santa', name: 'Golden Santa', rarity: 'epic', price: 0, source: 'advent', palette: { R: '#e0a800', W: '#fff7d1', Y: '#ffffff', B: '#6b4a00' } },
  santa_aurora: { id: 'santa_aurora', character: 'santa', name: 'Aurora Santa', rarity: 'legendary', price: 0, source: 'advent', palette: { R: '#35e6a8', W: '#e8fff6', Y: '#b98cff', B: '#2a1f5e' } },
  elf_classic: { id: 'elf_classic', character: 'elf', name: 'Classic Elf', rarity: 'common', price: 0, source: 'default', palette: {} },
  elf_candy: { id: 'elf_candy', character: 'elf', name: 'Candy Striper Elf', rarity: 'rare', price: 0, source: 'advent', palette: { G: '#e63946', R: '#ffffff', Y: '#ffffff' } },
  elf_midnight: { id: 'elf_midnight', character: 'elf', name: 'Midnight Elf', rarity: 'rare', price: 350, source: 'shop', palette: { G: '#2b3a8f', R: '#8fd0ff', Y: '#8fd0ff' } },
  snowman_classic: { id: 'snowman_classic', character: 'snowman', name: 'Classic Snowman', rarity: 'common', price: 0, source: 'default', palette: {} },
  snowman_festive: { id: 'snowman_festive', character: 'snowman', name: 'Top Hat Snowman', rarity: 'rare', price: 0, source: 'advent', palette: { K: '#14452f', R: '#e63946' } },
  snowman_ember: { id: 'snowman_ember', character: 'snowman', name: 'Ember Snowman', rarity: 'epic', price: 450, source: 'shop', palette: { W: '#ffd9b0', R: '#ff7a00' } },
  reindeer_classic: { id: 'reindeer_classic', character: 'reindeer', name: 'Classic Reindeer', rarity: 'common', price: 0, source: 'default', palette: {} },
  reindeer_glow: { id: 'reindeer_glow', character: 'reindeer', name: 'Glow-Nose Reindeer', rarity: 'epic', price: 0, source: 'advent', palette: { R: '#7dfcff', A: '#9be7ff' } },
  reindeer_snow: { id: 'reindeer_snow', character: 'reindeer', name: 'Snow Reindeer', rarity: 'rare', price: 500, source: 'shop', palette: { N: '#e8eef5', D: '#9fb4c7', T: '#ffffff', A: '#c9a66b' } },
  knight_classic: { id: 'knight_classic', character: 'knight', name: 'Classic Knight', rarity: 'common', price: 0, source: 'default', palette: {} },
  knight_royal: { id: 'knight_royal', character: 'knight', name: 'Royal Knight', rarity: 'epic', price: 0, source: 'advent', palette: { S: '#ffd166', I: '#b57cff' } },
  knight_dark: { id: 'knight_dark', character: 'knight', name: 'Burnt Knight', rarity: 'rare', price: 600, source: 'shop', palette: { B: '#4a2a18', S: '#6b6b7a', I: '#d0d0d0' } }
};
export const defaultSkinFor = (character) => `${character}_classic`;

// Enemies. `pts` is the score value; `xp` the gem value dropped.
export const ENEMIES = {
  snowman: { id: 'snowman', name: 'Evil Snowman', hp: 30, speed: 48, dmg: 8, pts: 10, xp: 1, size: 30, ai: 'chase', from: 1, weight: 5 },
  elf: { id: 'elf', name: 'Naughty Elf', hp: 12, speed: 98, dmg: 5, pts: 7, xp: 1, size: 26, ai: 'swarm', from: 1, weight: 6 },
  gingerbread: { id: 'gingerbread', name: 'Gingerbread Monster', hp: 26, speed: 64, dmg: 9, pts: 15, xp: 2, size: 30, ai: 'chase', from: 3, weight: 4 },
  reindeer: { id: 'reindeer', name: 'Evil Reindeer', hp: 40, speed: 70, dmg: 12, pts: 20, xp: 3, size: 32, ai: 'charge', from: 5, weight: 3 },
  ghost: { id: 'ghost', name: 'Christmas Ghost', hp: 20, speed: 72, dmg: 10, pts: 18, xp: 3, size: 30, ai: 'ghost', from: 7, weight: 3 }
};
export const MAX_POINTS_PER_KILL = 60; // elite reindeer: 20 * 3

// Bosses have two phases (switching at 50% HP). `moves` are the attack patterns they cycle through in each phase.
export const BOSSES = [
  { id: 'frostking', name: 'The Frost King', base: 'snowman', tint: 0x66ccff, scale: 3.4, hpMul: 1, speed: 42, dmg: 18, shots: 8, minion: null,
    moves: { 1: ['ring', 'fan'], 2: ['rain', 'spiral', 'ring'] } },
  { id: 'elfoverlord', name: 'Elf Overlord', base: 'elf', tint: 0xff66ff, scale: 3.4, hpMul: 0.9, speed: 70, dmg: 16, shots: 10, minion: 'elf',
    moves: { 1: ['fan', 'summon'], 2: ['spiral', 'dash', 'summon'] } },
  { id: 'titan', name: 'Gingerbread Titan', base: 'gingerbread', tint: 0xffaa33, scale: 3.8, hpMul: 1.25, speed: 46, dmg: 22, shots: 12, minion: 'gingerbread',
    moves: { 1: ['slam', 'ring'], 2: ['slam', 'summon', 'rain'] } },
  { id: 'blitzen', name: 'Blitzen the Cursed', base: 'reindeer', tint: 0xff4444, scale: 3.4, hpMul: 1.1, speed: 62, dmg: 22, shots: 10, minion: null,
    moves: { 1: ['dash', 'fan'], 2: ['dash', 'dash', 'ring'] } },
  { id: 'neverghost', name: 'Ghost of Christmas Never', base: 'ghost', tint: 0x99ffcc, scale: 3.8, hpMul: 1, speed: 58, dmg: 20, shots: 14, minion: 'ghost',
    moves: { 1: ['spiral', 'ring'], 2: ['blink', 'rain', 'summon'] } }
];

export const RARITIES = {
  common: { id: 'common', name: 'Common', color: '#c9d6e8', mult: 1, levels: 1 },
  rare: { id: 'rare', name: 'Rare', color: '#4aa3ff', mult: 1.6, levels: 1 },
  epic: { id: 'epic', name: 'Epic', color: '#c070ff', mult: 2.4, levels: 2 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ffc247', mult: 4, levels: 3 }
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

export const BOOSTS = {
  xp_boost: { id: 'xp_boost', name: 'Cocoa Rush', icon: '☕', desc: '+30% XP for your next run.' },
  heart_boost: { id: 'heart_boost', name: 'Gingerbread Heart', icon: '❤', desc: '+30 max HP for your next run.' },
  magnet_boost: { id: 'magnet_boost', name: 'Tinsel Magnet', icon: '🧲', desc: 'Double pickup range for your next run.' },
  shield_boost: { id: 'shield_boost', name: 'Snow Shield', icon: '🛡', desc: 'Start with a 50 point shield.' }
};
