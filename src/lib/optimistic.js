// Instant, local versions of what the server is about to do. Each returns a function that maps the current
// player state `me` ({ profile, inventory, ... }) to the expected new state. The server stays authoritative:
// after the request finishes the real state is reloaded, which also undoes any of these if the request failed.
const withProfile = (m, patch) => ({ ...m, profile: { ...m.profile, ...patch } });

export const optimistic = {
  buy: (type, id, price) => (m) => ({
    ...withProfile(m, { coins: Math.max(0, m.profile.coins - price) }),
    inventory: m.inventory.some((i) => i.item_type === type && i.item_id === id) ? m.inventory : [...m.inventory, { item_type: type, item_id: id }]
  }),
  select: (character, skin) => (m) => withProfile(m, {
    selected_character: character,
    equipped: skin ? { ...(m.profile.equipped || {}), [character]: skin } : m.profile.equipped
  }),
  cosmetic: (slot, id) => (m) => {
    const c = { ...(m.profile.cosmetics || {}) };
    if (id) c[slot] = id; else delete c[slot];
    return withProfile(m, { cosmetics: c });
  },
  loadout: (weapon, mods) => (m) => {
    const l = { ...(m.profile.loadout || {}) };
    if (mods.length) l[weapon] = mods; else delete l[weapon];
    return withProfile(m, { loadout: l });
  },
  title: (id) => (m) => withProfile(m, { equipped_title: id || null }),
  boost: (id) => (m) => withProfile(m, { active_boost: id || null })
};
