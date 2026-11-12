import { RARITIES, RARITY_ORDER, WEAPONS, MAX_WEAPON_LEVEL } from './catalog.js';
import { MODS, availableMods } from './mods.js';

// Each stat upgrade scales with the rolled rarity multiplier `m`.
export const STAT_UPGRADES = [
  { id: 'maxhp', icon: '❤', name: 'Peppermint Heart', desc: (m) => `+${Math.round(12 * m)} max HP and heal that much`, apply: (s, m) => { const v = Math.round(12 * m); s.maxHp += v; s.hp = Math.min(s.maxHp, s.hp + v); } },
  { id: 'speed', icon: '👟', name: 'Reindeer Boots', desc: (m) => `+${Math.round(5 * m)}% move speed`, apply: (s, m) => { s.speed *= 1 + 0.05 * m; } },
  { id: 'atk', icon: '⚡', name: 'Sugar Rush', desc: (m) => `+${Math.round(8 * m)}% attack speed`, apply: (s, m) => { s.atk *= 1 + 0.08 * m; } },
  { id: 'dmg', icon: '⚔', name: 'Sharpened Icicles', desc: (m) => `+${Math.round(10 * m)}% damage`, apply: (s, m) => { s.dmg *= 1 + 0.1 * m; } },
  { id: 'pickup', icon: '🧲', name: 'Tinsel Magnet', desc: (m) => `+${Math.round(20 * m)}% pickup range`, apply: (s, m) => { s.pickup *= 1 + 0.2 * m; } },
  { id: 'regen', icon: '☕', name: 'Hot Cocoa', desc: (m) => `+${(0.4 * m).toFixed(1)} HP regenerated per second`, apply: (s, m) => { s.regen += 0.4 * m; } },
  { id: 'crit', icon: '✦', name: 'Lucky Star', desc: (m) => `+${Math.round(5 * m)}% critical chance (double damage)`, apply: (s, m) => { s.crit = Math.min(0.9, s.crit + 0.05 * m); } },
  { id: 'xp', icon: '🎁', name: 'Wish List', desc: (m) => `+${Math.round(10 * m)}% XP gained`, apply: (s, m) => { s.xpMult += 0.1 * m; } },
  { id: 'armor', icon: '🛡', name: 'Wool Scarf', desc: (m) => `Take ${(0.6 * m).toFixed(1)} less damage per hit`, apply: (s, m) => { s.armor += 0.6 * m; } },
  { id: 'cdr', icon: '⏳', name: 'Advent Candle', desc: (m) => `Special ability recharges ${Math.round(6 * m)}% faster`, apply: (s, m) => { s.cdr = Math.min(0.7, s.cdr + 0.06 * m); } },
  { id: 'luck', icon: '🍀', name: 'Holly Charm', desc: (m) => `Rarer upgrades appear more often (+${Math.round(10 * m)}% luck)`, apply: (s, m) => { s.luck += 0.1 * m; } },
  { id: 'proj', icon: '✚', name: 'Extra Ammo', minRarity: 'rare', desc: (m) => `+${m >= 4 ? 2 : 1} projectile for snowballs, canes and bombs`, apply: (s, m) => { s.proj += m >= 4 ? 2 : 1; } }
];
const STAT_BY_ID = Object.fromEntries(STAT_UPGRADES.map((u) => [u.id, u]));

export function rollRarity(ctx, rng, minRarity = 'common') {
  const bonus = Math.min(ctx.wave || 1, 25) * 0.5 + (ctx.luck || 0) * 10;
  const w = {
    common: Math.max(20, 60 - bonus * 1.2),
    rare: 28 + bonus * 0.6,
    epic: 10 + bonus * 0.4,
    legendary: 2 + bonus * 0.15
  };
  const allowed = RARITY_ORDER.slice(RARITY_ORDER.indexOf(minRarity));
  const total = allowed.reduce((a, r) => a + w[r], 0);
  let roll = rng() * total;
  for (const r of allowed) { roll -= w[r]; if (roll <= 0) return r; }
  return allowed[0];
}

/**
 * ctx = { wave, luck, weapons: {id: level}, available: [weaponIds] }
 * Returns `count` distinct upgrade cards.
 */
export function rollUpgrades(ctx, rng = Math.random, count = 3) {
  const pool = STAT_UPGRADES.map((u) => ({ kind: 'stat', id: u.id, w: 1, min: u.minRarity || 'common' }));
  const owned = Object.keys(ctx.weapons);
  for (const id of ctx.available) {
    const lvl = ctx.weapons[id] || 0;
    if (lvl >= MAX_WEAPON_LEVEL) continue;
    if (lvl === 0 && owned.length >= 5) continue;
    pool.push({ kind: 'weapon', id, w: lvl === 0 ? 1.8 : 1.3, min: 'common' });
  }
  for (const wid of owned) {
    for (const m of availableMods(wid, ctx.weapons[wid], (ctx.mods || {})[wid] || [])) pool.push({ kind: 'mod', id: `${wid}:${m.id}`, w: 0.9, min: 'epic' });
  }
  const picks = [];
  while (picks.length < count && pool.length) {
    const total = pool.reduce((a, p) => a + p.w, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    picks.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return picks.map((p) => describeCard(p.kind, p.id, p.kind === 'mod' ? 'epic' : rollRarity(ctx, rng, p.min), ctx));
}

export function describeCard(kind, id, rarity, ctx) {
  const R = RARITIES[rarity];
  if (kind === 'mod') {
    const [wid, mid] = id.split(':');
    const m = MODS[wid].find((x) => x.id === mid);
    return { kind, id, rarity, weapon: wid, modId: mid, iconWeapon: wid, name: m.name, desc: m.desc, tag: `${WEAPONS[wid].name} mod` };
  }
  if (kind === 'weapon') {
    const w = WEAPONS[id];
    const lvl = ctx.weapons[id] || 0;
    return { kind, id, rarity, iconWeapon: id, name: lvl ? `${w.name} +${R.levels}` : `New: ${w.name}`, desc: lvl ? `Level ${lvl} → ${Math.min(MAX_WEAPON_LEVEL, lvl + R.levels)}. ${w.blurb}` : w.blurb, levels: R.levels };
  }
  const u = STAT_BY_ID[id];
  return { kind, id, rarity, icon: u.icon, name: u.name, desc: u.desc(R.mult), mult: R.mult };
}

export function applyUpgrade(card, stats, weapons, mods = {}) {
  if (card.kind === 'mod') {
    (mods[card.weapon] ||= []).push(card.modId);
  } else if (card.kind === 'weapon') {
    weapons[card.id] = Math.min(MAX_WEAPON_LEVEL, (weapons[card.id] || 0) + card.levels);
  } else {
    STAT_BY_ID[card.id].apply(stats, card.mult);
  }
}
