import { RARITIES, RARITY_ORDER, WEAPONS, MAX_WEAPON_LEVEL } from './catalog.js';

// Each stat upgrade scales with the rolled rarity multiplier `m`.
export const STAT_UPGRADES = [
  { id: 'maxhp', icon: '❤', name: 'Peppermint Heart', desc: (m) => `+${Math.round(12 * m)} max HP and heal that much`, apply: (s, m) => { const v = Math.round(12 * m); s.maxHp += v; s.hp = Math.min(s.maxHp, s.hp + v); } },
  { id: 'speed', icon: '👟', name: 'Reindeer Boots', desc: (m) => `+${Math.round(5 * m)}% move speed`, apply: (s, m) => { s.speed *= 1 + 0.05 * m; } },
  { id: 'atk', icon: '⚡', name: 'Sugar Rush', desc: (m) => `+${Math.round(8 * m)}% attack speed`, apply: (s, m) => { s.atk *= 1 + 0.08 * m; } },
  { id: 'dmg', icon: '⚔', name: 'Sharpened Icicles', desc: (m) => `+${Math.round(10 * m)}% damage`, apply: (s, m) => { s.dmg *= 1 + 0.1 * m; } },
  { id: 'pickup', icon: '🧲', name: 'Tinsel Magnet', desc: (m) => `+${Math.round(20 * m)}% pickup range`, apply: (s, m) => { s.pickup *= 1 + 0.2 * m; } },
  { id: 'regen', icon: '☕', name: 'Hot Cocoa', desc: (m) => `+${(0.4 * m).toFixed(1)} HP regenerated per second`, apply: (s, m) => { s.regen += 0.4 * m; } },
  { id: 'crit', icon: '✦', name: 'Lucky Star', desc: (m) => `+${Math.round(5 * m)}% critical chance (double damage)`, apply: (s, m) => { s.crit += 0.05 * m; } },
  { id: 'xp', icon: '🎁', name: 'Wish List', desc: (m) => `+${Math.round(10 * m)}% XP gained`, apply: (s, m) => { s.xpMult += 0.1 * m; } },
  { id: 'armor', icon: '🛡', name: 'Wool Scarf', desc: (m) => `Take ${(0.6 * m).toFixed(1)} less damage per hit`, apply: (s, m) => { s.armor += 0.6 * m; } },
  { id: 'cdr', icon: '⏳', name: 'Advent Candle', desc: (m) => `Special ability recharges ${Math.round(6 * m)}% faster`, apply: (s, m) => { s.cdr += 0.06 * m; } },
  { id: 'luck', icon: '🍀', name: 'Holly Charm', desc: (m) => `Rarer upgrades appear more often (+${Math.round(10 * m)}% luck)`, apply: (s, m) => { s.luck += 0.1 * m; } },
  { id: 'proj', icon: '✚', name: 'Extra Ammo', minRarity: 'rare', desc: (m) => `+${m >= 4 ? 2 : 1} projectile for snowballs, canes and bombs`, apply: (s, m) => { s.proj += m >= 4 ? 2 : 1; } }
];
const STAT_BY_ID = Object.fromEntries(STAT_UPGRADES.map((u) => [u.id, u]));

// ---- Upgrade limits ----------------------------------------------------------------------------
// Every stat has a ceiling: `rel` is a multiple of its starting value, `abs` is a fixed ceiling.
// Once a stat is maxed its card leaves the pool. The enemies are not affected by any of this.
export const CAPS = {
  maxhp: { key: 'maxHp', rel: 2.0 },
  speed: { key: 'speed', rel: 1.4 },
  atk: { key: 'atk', rel: 1.5 },
  dmg: { key: 'dmg', rel: 1.6 },
  pickup: { key: 'pickup', rel: 3 },
  xp: { key: 'xpMult', rel: 1.6 },
  regen: { key: 'regen', abs: 2.5 },
  crit: { key: 'crit', abs: 0.3 },
  armor: { key: 'armor', abs: 5 },
  cdr: { key: 'cdr', abs: 0.4 },
  luck: { key: 'luck', abs: 0.5 },
  proj: { key: 'proj', abs: 2 }
};

/** The ceiling for a stat. `stats.base` holds the starting values the relative caps are measured from. */
export function statCap(id, stats) {
  const c = CAPS[id];
  if (!c) return Infinity;
  if (c.abs !== undefined) return c.abs;
  const base = stats.base && stats.base[c.key];
  return base === undefined ? Infinity : base * c.rel;
}
export const isMaxed = (id, stats) => !!CAPS[id] && stats[CAPS[id].key] >= statCap(id, stats) - 1e-9;

export function clampStat(id, s) {
  const c = CAPS[id];
  if (!c) return;
  const max = statCap(id, s);
  if (s[c.key] > max) s[c.key] = max;
  if (id === 'maxhp') s.hp = Math.min(s.hp, s.maxHp);
}

// ---- Finishing touches: what you can pick once the real upgrades run out. None of them add power. ----
export const FINISHERS = [
  { id: 'cocoa', icon: '☕', name: 'Cocoa Refill', desc: 'Restore 20% of your max health.', repeat: true },
  { id: 'trail_snow', icon: '❄', name: 'Snowflake Trail', desc: 'Cosmetic: a drift of snowflakes follows you.' },
  { id: 'trail_stars', icon: '✨', name: 'Golden Sparkles', desc: 'Cosmetic: a trail of sparkles follows you.' },
  { id: 'halo', icon: '🎄', name: 'Holly Halo', desc: 'Cosmetic: a ring of holly orbits you.' },
  { id: 'confetti', icon: '🎉', name: 'Festive Confetti', desc: 'Cosmetic: defeated enemies burst into confetti.' }
];

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
 * ctx = { wave, luck, weapons: {id: level}, available: [weaponIds], stats?, cosmetics?: Set }
 * Returns up to `count` distinct cards. Maxed stats are left out; any shortfall is filled with finishing touches.
 */
export function rollUpgrades(ctx, rng = Math.random, count = 3) {
  const pool = STAT_UPGRADES.filter((u) => !(ctx.stats && isMaxed(u.id, ctx.stats))).map((u) => ({ kind: 'stat', id: u.id, w: 1, min: u.minRarity || 'common' }));
  const owned = Object.keys(ctx.weapons);
  for (const id of ctx.available) {
    const lvl = ctx.weapons[id] || 0;
    if (lvl >= MAX_WEAPON_LEVEL) continue;
    if (lvl === 0 && owned.length >= 5) continue;
    pool.push({ kind: 'weapon', id, w: lvl === 0 ? 1.8 : 1.3, min: 'common' });
  }
  const picks = [];
  while (picks.length < count && pool.length) {
    const total = pool.reduce((a, p) => a + p.w, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= pool[idx].w; if (r <= 0) break; }
    picks.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  const cards = picks.map((p) => describeCard(p.kind, p.id, rollRarity(ctx, rng, p.min), ctx));
  if (cards.length < count) {
    const eligible = FINISHERS.filter((f) => f.repeat || !(ctx.cosmetics && ctx.cosmetics.has(f.id)));
    while (cards.length < count && eligible.length) {
      const f = eligible.splice(Math.floor(rng() * eligible.length), 1)[0];
      cards.push({ kind: 'finisher', id: f.id, rarity: 'common', icon: f.icon, name: f.name, desc: f.desc });
    }
  }
  // If all that is left is the cocoa refill, the game just applies it instead of opening a menu.
  if (cards.length === 1 && cards[0].id === 'cocoa') cards[0].auto = true;
  return cards;
}

export function describeCard(kind, id, rarity, ctx) {
  const R = RARITIES[rarity];
  if (kind === 'weapon') {
    const w = WEAPONS[id];
    const lvl = ctx.weapons[id] || 0;
    return { kind, id, rarity, iconWeapon: id, name: lvl ? `${w.name} +${R.levels}` : `New: ${w.name}`, desc: lvl ? `Level ${lvl} → ${Math.min(MAX_WEAPON_LEVEL, lvl + R.levels)}. ${w.blurb}` : w.blurb, levels: R.levels };
  }
  const u = STAT_BY_ID[id];
  let desc = u.desc(R.mult);
  if (ctx.stats) {            // tell the player when this pick reaches the limit
    const sim = { ...ctx.stats };
    u.apply(sim, R.mult); clampStat(id, sim);
    if (isMaxed(id, sim)) desc += ' (reaches the limit)';
  }
  return { kind, id, rarity, icon: u.icon, name: u.name, desc, mult: R.mult };
}

export function applyUpgrade(card, stats, weapons, cosmetics = null) {
  if (card.kind === 'weapon') {
    weapons[card.id] = Math.min(MAX_WEAPON_LEVEL, (weapons[card.id] || 0) + card.levels);
  } else if (card.kind === 'finisher') {
    if (card.id === 'cocoa') stats.hp = Math.min(stats.maxHp, stats.hp + stats.maxHp * 0.2);
    else if (cosmetics) cosmetics.add(card.id);
  } else {
    STAT_BY_ID[card.id].apply(stats, card.mult);
    clampStat(card.id, stats);
  }
}
