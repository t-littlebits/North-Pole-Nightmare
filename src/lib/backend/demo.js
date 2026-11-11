// Demo backend: the whole game works offline with data stored in this browser.
// It mirrors the server rules (same validation + advent checks) so demo == real behaviour.
import { CHARACTERS, SKINS, WEAPONS, BOOSTS, DEFAULT_WEAPONS, CHARACTER_IDS, defaultSkinFor } from '../../data/catalog.js';
import { validateRun, checkClaim, adventYear } from '../../shared/rules.js';
import { USERNAME_RE } from '../../shared/rules.js';
import { clock } from '../clock.js';

const KEY = 'npn.demo.v1';
const authSubs = new Set();
const lbSubs = new Set();

const BOTS = [
  ['FrostyMcBot', 18420, 14, 1210, 'snowman'], ['CocoaCommander', 15110, 12, 980, 'santa'], ['TinselTerror', 12750, 11, 905, 'elf'],
  ['PixelPudding', 9980, 9, 760, 'knight'], ['Jingle_Jinx', 8120, 8, 640, 'reindeer'], ['SnowBlitz', 6440, 7, 520, 'elf'],
  ['MrsClausBot', 4890, 6, 410, 'santa'], ['IcicleIvy', 3320, 5, 300, 'snowman'], ['GingerSnap', 2100, 4, 190, 'knight'], ['NoelNoob', 880, 2, 70, 'santa']
].map(([username, best_score, best_wave, kills, character], i) => ({
  id: `bot-${i}`, username, best_score, best_wave, total_kills: kills * 3, games_played: 10 + i * 3, total_score: best_score * 4,
  total_seconds: best_wave * 30 * 4, bosses_defeated: Math.floor(best_wave / 5) * 2, presents_opened: best_wave * 2,
  selected_character: character, equipped: {}, created_at: '2026-10-01T00:00:00Z', bot: true, kills, character
}));

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.users) return d; } catch { /* fresh */ }
  return { session: null, users: {} };
}
let db = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full/unavailable */ } };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
const me = () => (db.session ? db.users[db.session] : null);
const notifyAuth = () => authSubs.forEach((f) => f());
const notifyLb = () => lbSubs.forEach((f) => f());

function newUser(username) {
  const id = uid();
  const inventory = [
    ...['santa', 'elf'].map((c) => ({ item_type: 'character', item_id: c })),
    ...DEFAULT_WEAPONS.map((w) => ({ item_type: 'weapon', item_id: w })),
    ...CHARACTER_IDS.map((c) => ({ item_type: 'skin', item_id: defaultSkinFor(c) }))
  ];
  return {
    id, username, inventory, claims: [], runs: {}, scores: [],
    profile: {
      id, username, coins: 0, selected_character: 'santa', equipped: {}, boosts: {}, active_boost: null,
      games_played: 0, total_kills: 0, total_score: 0, best_score: 0, best_wave: 0, total_seconds: 0,
      bosses_defeated: 0, presents_opened: 0, created_at: new Date().toISOString()
    }
  };
}
const owns = (u, type, id) => u.inventory.some((i) => i.item_type === type && i.item_id === id);
const give = (u, type, id) => { if (!owns(u, type, id)) u.inventory.push({ item_type: type, item_id: id }); };
const fail = (msg) => { throw new Error(msg); };

function leaderboardRows() {
  const real = Object.values(db.users).filter((u) => u.profile.best_score > 0).map((u) => {
    const best = u.scores.reduce((a, s) => (s.score > (a?.score ?? -1) ? s : a), null);
    return { user_id: u.id, username: u.username, score: u.profile.best_score, wave: u.profile.best_wave, kills: best?.kills ?? 0, character: best?.character ?? u.profile.selected_character, achieved_at: best?.created_at ?? u.profile.created_at };
  });
  const bots = BOTS.map((b) => ({ user_id: b.id, username: b.username, score: b.best_score, wave: b.best_wave, kills: b.kills, character: b.character, achieved_at: b.created_at }));
  return [...real, ...bots].sort((a, b) => b.score - a.score);
}

export const demo = {
  mode: 'demo',
  async init() { /* nothing to restore: db is already loaded */ },
  onAuthChange(cb) { authSubs.add(cb); return () => authSubs.delete(cb); },
  async getSession() { const u = me(); return u ? { id: u.id, username: u.username } : null; },

  async signUp({ username }) {
    if (!USERNAME_RE.test(username || '')) fail('Username must be 3-16 letters, numbers or underscores');
    const taken = Object.keys(db.users).includes(username.toLowerCase()) || BOTS.some((b) => b.username.toLowerCase() === username.toLowerCase());
    if (taken) fail('That name is taken');
    db.users[username.toLowerCase()] = newUser(username);
    db.session = username.toLowerCase();
    save(); notifyAuth();
    return {};
  },
  async signIn({ username }) {
    const u = db.users[(username || '').toLowerCase()];
    if (!u) fail('No demo player with that name on this device. Create one instead.');
    db.session = username.toLowerCase();
    save(); notifyAuth();
  },
  async signOut() { db.session = null; save(); notifyAuth(); },
  listLocalPlayers() { return Object.values(db.users).map((u) => u.username); },
  async resetAll() { db = { session: null, users: {} }; save(); notifyAuth(); notifyLb(); },

  async getMe() {
    const u = me();
    if (!u) return null;
    const year = adventYear(clock.now());
    return { user: { id: u.id, username: u.username }, profile: { ...u.profile }, inventory: [...u.inventory], claims: u.claims.filter((c) => c.year === year) };
  },

  async startRun(character) {
    const u = me() || fail('Sign in first');
    if (!CHARACTERS[character] || !owns(u, 'character', character)) fail('Character not unlocked');
    let boost = null;
    const b = u.profile.active_boost;
    if (b && (u.profile.boosts[b] || 0) > 0) { u.profile.boosts[b] -= 1; boost = b; if (!u.profile.boosts[b]) u.profile.active_boost = null; }
    Object.values(u.runs).forEach((r) => { r.submitted = true; });
    const runId = uid();
    u.runs[runId] = { character, boost, startedAt: Date.now(), submitted: false };
    save();
    return { runId, boost };
  },

  async submitRun(runId, stats) {
    const u = me() || fail('Sign in first');
    const run = u.runs[runId];
    if (!run || run.submitted) fail('This run was already submitted');
    run.submitted = true;
    const v = validateRun(stats, (Date.now() - run.startedAt) / 1000);
    if (!v.ok) { save(); fail(`Run rejected: ${v.error}`); }
    const r = v.run, p = u.profile, prev = p.best_score;
    u.scores.unshift({ score: r.score, wave: r.wave, kills: r.kills, bosses: r.bosses, seconds: r.seconds, character: run.character, created_at: new Date().toISOString() });
    u.scores = u.scores.slice(0, 50);
    p.coins += r.coins; p.games_played += 1; p.total_kills += r.kills; p.total_score += r.score;
    p.best_score = Math.max(p.best_score, r.score); p.best_wave = Math.max(p.best_wave, r.wave);
    p.total_seconds += r.seconds; p.bosses_defeated += r.bosses; p.presents_opened += r.presents;
    save(); notifyLb();
    const rank = leaderboardRows().findIndex((x) => x.user_id === u.id) + 1;
    return { score: r.score, coins: r.coins, wave: r.wave, kills: r.kills, isBest: r.score > prev, prevBest: prev, rank };
  },

  async getLeaderboard(limit = 50) { return leaderboardRows().slice(0, limit); },
  subscribeLeaderboard(cb) { lbSubs.add(cb); return () => lbSubs.delete(cb); },

  async claimDay(day) {
    const u = me() || fail('Sign in first');
    const now = clock.now();
    const year = adventYear(now);
    const c = checkClaim(year, Number(day), u.claims.filter((x) => x.year === year).map((x) => x.day), now);
    if (!c.ok) fail(c.error);
    u.claims.push({ year, day: c.reward.day });
    for (const g of c.reward.grants) {
      if (g.type === 'coins') u.profile.coins += g.amount;
      else if (g.type === 'boost') u.profile.boosts[g.id] = (u.profile.boosts[g.id] || 0) + (g.amount || 1);
      else give(u, g.type, g.id);
    }
    save();
    return { reward: c.reward };
  },

  async buy(type, id) {
    const u = me() || fail('Sign in first');
    let price = 0;
    if (type === 'character' && CHARACTERS[id]) price = CHARACTERS[id].price;
    else if (type === 'weapon' && WEAPONS[id]) price = WEAPONS[id].price;
    else if (type === 'skin' && SKINS[id]?.source === 'shop') price = SKINS[id].price;
    if (!price) fail('This item cannot be bought');
    if (owns(u, type, id)) fail('You already own this');
    if (u.profile.coins < price) fail('Not enough coins');
    u.profile.coins -= price;
    give(u, type, id);
    save();
  },

  async select({ character, skin }) {
    const u = me() || fail('Sign in first');
    if (!owns(u, 'character', character)) fail('Character not unlocked');
    if (skin) {
      if (SKINS[skin]?.character !== character || !owns(u, 'skin', skin)) fail('Skin not unlocked');
      u.profile.equipped[character] = skin;
    }
    u.profile.selected_character = character;
    save();
  },

  async setBoost(id) {
    const u = me() || fail('Sign in first');
    if (id && !(BOOSTS[id] && (u.profile.boosts[id] || 0) > 0)) fail('You have none of this boost');
    u.profile.active_boost = id || null;
    save();
  },

  async saveSettings() { /* settings already live in localStorage */ },

  async searchPlayers(q) {
    const needle = (q || '').trim().toLowerCase();
    const all = [...Object.values(db.users).map((u) => u.profile), ...BOTS];
    return all.filter((p) => !needle || p.username.toLowerCase().includes(needle)).sort((a, b) => b.best_score - a.best_score).slice(0, 20);
  },

  async getPlayer(username) {
    const key = (username || '').toLowerCase();
    const u = db.users[key];
    const bot = BOTS.find((b) => b.username.toLowerCase() === key);
    if (!u && !bot) return null;
    const profile = u ? u.profile : bot;
    const rows = leaderboardRows();
    const idx = rows.findIndex((r) => r.username.toLowerCase() === key);
    return { profile, recent: u ? u.scores.slice(0, 8) : [{ score: bot.best_score, wave: bot.best_wave, kills: bot.kills, character: bot.character, created_at: bot.created_at }], rank: idx >= 0 ? idx + 1 : null };
  }
};
