// Weapon mods. A weapon at level 3 offers its first mod, at level 6 a second one (you choose from the unpicked mods).
export const MODS = {
  snowball: [
    { id: 'frozen_core', name: 'Frozen Core', desc: 'Snowballs slow what they hit by 40% for 2 seconds.' },
    { id: 'split', name: 'Splitter', desc: 'Snowballs break into two smaller balls on their first hit.' },
    { id: 'heavy', name: 'Packed Solid', desc: '+60% damage and +1 pierce, but you throw 25% slower.' }
  ],
  candycane: [
    { id: 'razor', name: 'Razor Stripes', desc: '+40% damage and the cane returns much faster.' },
    { id: 'sticky', name: 'Sticky Sweet', desc: 'Hit enemies are slowed by 50% for 1.5 seconds.' },
    { id: 'boomerang_pair', name: 'Back-to-Back', desc: 'Every throw sends an extra cane flying the opposite way.' }
  ],
  iceblast: [
    { id: 'glacier', name: 'Glacier', desc: '+30% radius and every blast knocks enemies back.' },
    { id: 'shatter', name: 'Shatter', desc: 'Normal enemies under 25% health are instantly shattered.' },
    { id: 'echo', name: 'Echo Frost', desc: 'Every blast is followed by a second one half a second later.' }
  ],
  bells: [
    { id: 'resonance', name: 'Resonance', desc: '+2 bells in orbit.' },
    { id: 'tuned', name: 'Tuned Brass', desc: 'Bigger bells that hit 40% harder.' },
    { id: 'chime', name: 'Chime Burst', desc: 'Every 3 seconds the bells ring out a damaging shockwave.' }
  ],
  bomb: [
    { id: 'cluster', name: 'Cluster Batch', desc: 'Each bomb pops three smaller bombs around it.' },
    { id: 'glaze', name: 'Burning Glaze', desc: 'Explosions leave a patch of fire for 3.5 seconds.' },
    { id: 'big_boom', name: 'Triple Spice', desc: '+40% blast radius and +30% damage.' }
  ]
};

/** Mods the player can currently be offered for `weaponId` at `level`, given the ids already picked. */
export function availableMods(weaponId, level, picked = []) {
  const ok = (picked.length === 0 && level >= 3) || (picked.length === 1 && level >= 6);
  return ok ? (MODS[weaponId] || []).filter((m) => !picked.includes(m.id)) : [];
}
