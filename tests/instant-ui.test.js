import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRunner } from '../src/lib/actionRunner.js';
import { optimistic } from '../src/lib/optimistic.js';
import { affordable, isLit } from '../src/lib/shop.js';

// A tiny fake of the React state the runner drives.
function harness(initialMe) {
  const h = { me: initialMe, pending: {}, toasts: [], refreshes: 0, log: [] };
  h.setMe = (fn) => { h.me = fn(h.me); h.log.push(['me', JSON.stringify(h.me.profile.coins)]); };
  h.setPending = (fn) => { h.pending = fn(h.pending); h.log.push(['pending', Object.keys(h.pending).join(',')]); };
  h.showToast = (msg, kind) => h.toasts.push([msg, kind]);
  h.refresh = async () => { h.refreshes += 1; };
  h.act = createRunner(h);
  return h;
}
const later = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
const baseMe = () => ({ profile: { coins: 1000, equipped: {}, cosmetics: {}, loadout: {}, equipped_title: null, active_boost: null, selected_character: 'santa' }, inventory: [{ item_type: 'skin', item_id: 'santa_classic' }] });

test('runner: the screen updates and the spinner shows BEFORE the slow server answers', async () => {
  const h = harness(baseMe());
  let serverDone = false;
  const p = h.act(async () => { await later(40); serverDone = true; return { ok: true }; }, 'Unlocked!', { key: 'item:skin:santa_frost', optimistic: optimistic.buy('skin', 'santa_frost', 400) });
  // synchronously after the click, before any waiting:
  assert.equal(serverDone, false);
  assert.equal(h.me.profile.coins, 600, 'coins already deducted');
  assert.ok(h.me.inventory.some((i) => i.item_id === 'santa_frost'), 'item already owned');
  assert.equal(h.pending['item:skin:santa_frost'], true, 'button is in its pending state');
  assert.equal(h.toasts.length, 0);
  const r = await p;
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(h.pending, {}, 'spinner cleared');
  assert.deepEqual(h.toasts, [['Unlocked!', 'ok']]);
  assert.equal(h.refreshes, 1, 'then the real state is reloaded once');
});

test('runner: if the server says no, the user is told and the real state is restored', async () => {
  const h = harness(baseMe());
  const r = await h.act(async () => { await later(10); throw new Error('Not enough coins'); }, 'Unlocked!', { key: 'k', optimistic: optimistic.buy('skin', 'x', 400) });
  assert.equal(r, null);
  assert.deepEqual(h.toasts, [['Not enough coins', 'err']]);
  assert.deepEqual(h.pending, {});
  assert.equal(h.refreshes, 1, 'refresh reverts the optimistic change');
});

test('runner: overlapping clicks only reload once, after the last one finishes', async () => {
  const h = harness(baseMe());
  const a = h.act(() => later(30, 'a'), null, { key: 'a', optimistic: optimistic.title('fresh_snowflake') });
  const b = h.act(() => later(10, 'b'), null, { key: 'b', optimistic: optimistic.title('boss_hunter') });
  assert.equal(h.me.profile.equipped_title, 'boss_hunter', 'latest click shows immediately');
  assert.equal(await b, 'b');
  assert.equal(h.refreshes, 0, 'no stale reload while another action is still running');
  assert.equal(h.pending.a, true); assert.equal(h.pending.b, undefined);
  assert.equal(await a, 'a');
  assert.equal(h.refreshes, 1);
  assert.deepEqual(h.pending, {});
});

test('runner: works without a key or optimistic update, and survives odd errors', async () => {
  const h = harness(baseMe());
  assert.equal(await h.act(async () => 42), 42);
  assert.equal(h.refreshes, 1);
  assert.equal(await h.act(async () => { throw 'boom'; }), null);
  assert.deepEqual(h.toasts.at(-1), ['Something went wrong', 'err']);
});

test('optimistic helpers produce the expected state without mutating the old one', () => {
  const m = baseMe(); const snapshot = JSON.stringify(m);
  const bought = optimistic.buy('cosmetic', 'trail_snow', 300)(m);
  assert.equal(bought.profile.coins, 700);
  assert.ok(bought.inventory.some((i) => i.item_type === 'cosmetic' && i.item_id === 'trail_snow'));
  assert.equal(optimistic.buy('skin', 'santa_classic', 50)(m).inventory.length, 1, 'no duplicate rows');
  assert.equal(optimistic.buy('skin', 'x', 5000)(m).profile.coins, 0, 'never negative');
  assert.deepEqual(optimistic.select('knight', 'knight_royal')(m).profile.equipped, { knight: 'knight_royal' });
  assert.equal(optimistic.select('elf', null)(m).profile.selected_character, 'elf');
  const withTrail = optimistic.cosmetic('trail', 'trail_snow')(m);
  assert.deepEqual(withTrail.profile.cosmetics, { trail: 'trail_snow' });
  assert.deepEqual(optimistic.cosmetic('trail', null)(withTrail).profile.cosmetics, {});
  const lo = optimistic.loadout('snowball', ['gust', 'frost'])(m);
  assert.deepEqual(lo.profile.loadout, { snowball: ['gust', 'frost'] });
  assert.deepEqual(optimistic.loadout('snowball', [])(lo).profile.loadout, {});
  assert.equal(optimistic.title('owner')(m).profile.equipped_title, 'owner');
  assert.equal(optimistic.boost('xp_boost')(m).profile.active_boost, 'xp_boost');
  assert.equal(JSON.stringify(m), snapshot, 'the original state object is untouched');
});

test('lit-up rule: owned or affordable items are bright; others are dimmed', () => {
  assert.equal(isLit(true, true, 0, 500), true, 'owned');
  assert.equal(isLit(false, true, 500, 500), true, 'exactly affordable');
  assert.equal(isLit(false, true, 499, 500), false, 'one coin short');
  assert.equal(isLit(false, false, 99999, 500), false, 'guests have no coins');
  assert.equal(isLit(false, true, 99999, Infinity), false, 'items that cannot be bought (advent-only, secret) stay dim');
  assert.equal(affordable(true, 300, 300), true);
  assert.equal(affordable(true, 0, undefined), false);
  const page = fs.readFileSync(new URL('../src/pages/CollectionPage.jsx', import.meta.url), 'utf8');
  assert.ok(page.includes("lit(has, s.source === 'shop' ? s.price : Infinity)"), 'shop skins use the rule (non-shop skins never light up)');
  assert.ok(page.includes('lit(has, c.price)'), 'effects use the rule');
});

test('the Collection buttons all go through the instant runner (no raw awaits left)', () => {
  const page = fs.readFileSync(new URL('../src/pages/CollectionPage.jsx', import.meta.url), 'utf8');
  assert.ok(!/await act\(\(\) => backend\.(equip|select|buy(?!ModCrate))/.test(page));
  for (const needle of ['optimistic.buy', 'optimistic.select', 'optimistic.cosmetic', 'optimistic.loadout', 'optimistic.title', "pendingLabel=\"Buying…\"", "pendingLabel=\"Saving…\""]) assert.ok(page.includes(needle), needle);
});
