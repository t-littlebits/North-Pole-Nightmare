// Weapon mods are a COLLECTION: you unlock them (titles, advent calendar, present drops, Mod Crates), then equip up to
// three per weapon before a run. Mods change how a weapon behaves; none of them add damage, attack speed or XP.
import { TITLES } from './titles.js';

export const MAX_SLOTS = 3;
export const PRESENT_MOD_RATE = 0.02;   // chance that any opened mystery present also contains a mod (rolled by the server)
export const MOD_CRATE_PRICE = 500;     // coins

const NOT_BELLS = ['snowball', 'candycane', 'iceblast', 'bomb'];
const defs = {
  gust: { name: 'Wind Gust', icon: '🌬', rarity: 'common', weapons: null, desc: '20% chance for a hit to blast the enemy backwards.' },
  frost: { name: 'Frost Touch', icon: '❄', rarity: 'common', weapons: null, desc: '25% chance for a hit to chill the enemy, slowing it by half for 2 seconds.' },
  snare: { name: 'Tangle Tinsel', icon: '🧵', rarity: 'rare', weapons: null, desc: '15% chance for a hit to tangle a regular enemy, slowing it to a crawl for 1.5 seconds.' },
  stun: { name: 'Static Shock', icon: '⚡', rarity: 'rare', weapons: null, desc: '8% chance for a hit to stun a regular enemy for 1 second.' },
  echo: { name: 'Echo', icon: '🔊', rarity: 'epic', weapons: NOT_BELLS, desc: 'Every 5th attack is immediately repeated by a free echo attack.' },
  ricochet: { name: 'Ricochet', icon: '↩', rarity: 'rare', weapons: ['snowball'], desc: 'Snowballs bounce to a second enemy after their first hit.' },
  seeker: { name: 'Heat Seeker', icon: '🎯', rarity: 'common', weapons: ['snowball'], desc: 'Snowballs gently curve toward nearby enemies.' },
  hook: { name: 'Candy Hook', icon: '🪝', rarity: 'rare', weapons: ['candycane'], desc: 'Returning canes snag enemies and drag them toward you.' },
  whirl: { name: 'Whirligig', icon: '🌀', rarity: 'common', weapons: ['candycane'], desc: 'Canes hover and spin at the end of their throw before returning.' },
  deepfreeze: { name: 'Deep Freeze', icon: '🧊', rarity: 'rare', weapons: ['iceblast'], desc: '15% chance for each enemy caught in a blast to be frozen solid for 1 second.' },
  lingering: { name: 'Lingering Frost', icon: '☁', rarity: 'common', weapons: ['iceblast'], desc: 'Each blast leaves a patch of frost that slows enemies for 3 seconds.' },
  chime: { name: 'Chime Wave', icon: '🎐', rarity: 'rare', weapons: ['bells'], desc: 'Every 3 seconds the bells ring out a wave that pushes enemies back (no damage).' },
  counter: { name: 'Counter-Rotation', icon: '🔄', rarity: 'common', weapons: ['bells'], desc: 'Every other bell orbits in the opposite direction.' },
  gravity: { name: 'Gravity Gingerbread', icon: '🌑', rarity: 'epic', weapons: ['bomb'], desc: 'Bombs pull nearby enemies into the blast centre just before they explode.' },
  glaze: { name: 'Sticky Glaze', icon: '🍬', rarity: 'common', weapons: ['bomb'], desc: 'Explosions leave a sticky patch that slows enemies for 3 seconds.' }
};
export const MODS = Object.fromEntries(Object.entries(defs).map(([id, m]) => [id, { id, ...m }]));
export const MOD_LIST = Object.values(MODS);

export const canEquip = (modId, weaponId) => !!MODS[modId] && (!MODS[modId].weapons || MODS[modId].weapons.includes(weaponId));
export const modFits = (modId) => (MODS[modId].weapons ? MODS[modId].weapons.join(', ') : 'any weapon');

/** Clean up a {weaponId: [modIds]} loadout: known weapons, compatible + owned mods, no duplicates, at most MAX_SLOTS. */
export function sanitizeLoadout(loadout, ownedMods = null, ownedWeapons = null) {
  const out = {};
  for (const w of ['snowball', 'candycane', 'iceblast', 'bells', 'bomb']) {
    if (ownedWeapons && !ownedWeapons.has(w)) continue;
    const list = (Array.isArray(loadout?.[w]) ? loadout[w] : [])
      .filter((id, i, a) => a.indexOf(id) === i && canEquip(id, w) && (!ownedMods || ownedMods.has(id)))
      .slice(0, MAX_SLOTS);
    if (list.length) out[w] = list;
  }
  return out;
}

const RARITY_WEIGHT = { common: 5, rare: 3, epic: 1, legendary: 0.5 };
// Mods that an achievement (title) can award. Random sources (presents, Mod Crates) never hand these out, so
// anything you can earn by playing is not also a lottery prize.
export const ACHIEVEMENT_MODS = new Set(TITLES.map((t) => t.mod).filter(Boolean));

/** Picks a random mod the player does not own yet (weighted by rarity) from those no achievement gives, or null if none are left. */
export function rollModDrop(owned, rng = Math.random) {
  const pool = MOD_LIST.filter((m) => !owned.has(m.id) && !ACHIEVEMENT_MODS.has(m.id));
  if (!pool.length) return null;
  let r = rng() * pool.reduce((a, m) => a + RARITY_WEIGHT[m.rarity], 0);
  for (const m of pool) { r -= RARITY_WEIGHT[m.rarity]; if (r <= 0) return m.id; }
  return pool[pool.length - 1].id;
}

/** Each opened present has a small chance to hold a mod. Rolled server-side from the validated present count. */
export function rollPresentMods(presents, owned, rng = Math.random) {
  const have = new Set(owned), found = [];
  for (let i = 0; i < Math.min(presents, 300); i++) {
    if (rng() < PRESENT_MOD_RATE) { const id = rollModDrop(have, rng); if (id) { found.push(id); have.add(id); } }
  }
  return found;
}
