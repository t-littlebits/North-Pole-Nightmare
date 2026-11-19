// Cosmetic effects bought with coins. They are purely visual (no stats) and show during your runs.
// One can be equipped in each slot: a trail behind you, an aura around you, and an effect when enemies are defeated.
export const COSMETIC_SLOTS = ['trail', 'aura', 'kill'];
export const SLOT_NAMES = { trail: 'Trails', aura: 'Auras', kill: 'Defeat effects' };

const defs = {
  trail_snow: { slot: 'trail', name: 'Snowflake Trail', icon: '❄', rarity: 'common', price: 300, desc: 'A drift of snowflakes follows you.' },
  trail_stars: { slot: 'trail', name: 'Golden Sparkles', icon: '✨', rarity: 'rare', price: 450, desc: 'A glittering trail of gold sparkles.' },
  trail_candy: { slot: 'trail', name: 'Peppermint Swirls', icon: '🍭', rarity: 'rare', price: 450, desc: 'Red and white peppermint bits tumble behind you.' },
  trail_holly: { slot: 'trail', name: 'Holly Leaves', icon: '🍃', rarity: 'rare', price: 450, desc: 'Holly leaves and berries drop in your wake.' },
  trail_aurora: { slot: 'trail', name: 'Aurora Ribbon', icon: '🌌', rarity: 'epic', price: 900, desc: 'A ribbon of shifting northern-lights colours.' },
  halo_holly: { slot: 'aura', name: 'Holly Halo', icon: '🎄', rarity: 'common', price: 400, desc: 'A ring of holly orbits you.' },
  aura_frost: { slot: 'aura', name: 'Frost Ring', icon: '🧊', rarity: 'rare', price: 550, desc: 'A pulsing ring of frost around your feet.' },
  aura_stars: { slot: 'aura', name: 'Orbiting Stars', icon: '⭐', rarity: 'epic', price: 750, desc: 'Three golden stars circle you.' },
  aura_aurora: { slot: 'aura', name: 'Aurora Orbit', icon: '🌈', rarity: 'epic', price: 900, desc: 'A swirl of aurora-coloured lights.' },
  kill_confetti: { slot: 'kill', name: 'Festive Confetti', icon: '🎉', rarity: 'common', price: 350, desc: 'Defeated enemies burst into confetti.' },
  kill_snow: { slot: 'kill', name: 'Snow Poof', icon: '☃', rarity: 'common', price: 300, desc: 'Defeated enemies puff away in snow.' },
  kill_candy: { slot: 'kill', name: 'Candy Shower', icon: '🍬', rarity: 'rare', price: 600, desc: 'Defeated enemies burst into sweets.' }
};
export const COSMETICS = Object.fromEntries(Object.entries(defs).map(([id, c]) => [id, { id, ...c }]));
export const COSMETIC_LIST = Object.values(COSMETICS);

/** Keep only valid, slot-matching (and, if given, owned) selections: {trail, aura, kill}. */
export function sanitizeCosmetics(sel, owned = null) {
  const out = {};
  for (const slot of COSMETIC_SLOTS) {
    const id = sel && sel[slot];
    if (id && COSMETICS[id] && COSMETICS[id].slot === slot && (!owned || owned.has(id))) out[slot] = id;
  }
  return out;
}
