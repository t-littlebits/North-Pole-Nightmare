import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRpc, isMissingFunction, FRIENDLY } from '../src/lib/backend/rpc.js';
import { buildCatalogSql, catalogRows } from '../scripts/gen-catalog-sql.mjs';
import { CHARACTERS, WEAPONS, SKINS, BOOSTS } from '../src/data/catalog.js';
import { COSMETIC_LIST } from '../src/data/cosmetics.js';
import { MOD_LIST, ACHIEVEMENT_MODS, MOD_CRATE_PRICE } from '../src/data/mods.js';
import { TITLES } from '../src/data/titles.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const fake = (result) => ({ calls: [], rpc(name, args) { this.calls.push([name, args]); return Promise.resolve(typeof result === 'function' ? result(name, args) : result); } });

test('rpc: returns the data on success and passes the arguments straight through', async () => {
  const c = fake({ data: { ok: true, mod: 'hook' }, error: null });
  assert.deepEqual(await createRpc(c)('shop_open_crate', {}, () => assert.fail('no fallback')), { ok: true, mod: 'hook' });
  assert.deepEqual(c.calls[0], ['shop_open_crate', {}]);
});

test('rpc: falls back to the Netlify route when the SQL is not installed yet', async () => {
  for (const error of [{ code: 'PGRST202', message: 'Could not find the function public.shop_buy(p_id, p_type) in the schema cache' }, { code: '42883', message: 'function does not exist' }, { code: 'P0001', message: 'catalog_missing' }]) {
    assert.equal(isMissingFunction(error), true);
    const r = await createRpc(fake({ data: null, error }))('shop_buy', {}, async () => 'via-netlify');
    assert.equal(r, 'via-netlify');
  }
  assert.equal(isMissingFunction({ code: 'P0001', message: 'not_enough_coins' }), false);
});

test('rpc: real refusals become friendly messages (never silently fall back)', async () => {
  for (const [msg, text] of Object.entries(FRIENDLY)) {
    await assert.rejects(() => createRpc(fake({ data: null, error: { code: 'P0001', message: msg } }))('shop_buy', {}, async () => assert.fail('must not fall back')), (e) => e.message === text);
  }
  await assert.rejects(() => createRpc(fake({ data: null, error: { code: '08006', message: 'connection lost' } }))('x', {}), /Something went wrong/);
});

test('rpc: without a fallback a missing function is reported, not hidden', async () => {
  await assert.rejects(() => createRpc(fake({ data: null, error: { code: 'PGRST202', message: 'x' } }))('shop_buy', {}), /Something went wrong/);
});

// ---- the generated catalogue stays in step with the game ----
test('catalog.sql is up to date with the game data (run `npm run gen:catalog` if this fails)', () => {
  assert.equal(read('supabase/catalog.sql'), buildCatalogSql());
});

test('catalogue rows: every item, with the same prices and rules the game uses', () => {
  const rows = catalogRows();
  const of = (t) => rows.filter((r) => r.type === t);
  assert.equal(of('character').length, Object.keys(CHARACTERS).length);
  assert.equal(of('weapon').length, Object.keys(WEAPONS).length);
  assert.equal(of('skin').length, Object.keys(SKINS).length);
  assert.equal(of('cosmetic').length, COSMETIC_LIST.length);
  assert.equal(of('mod').length, MOD_LIST.length);
  assert.equal(of('title').length, TITLES.length);
  assert.equal(of('boost').length, Object.keys(BOOSTS).length);
  assert.deepEqual(of('crate').map((r) => [r.id, r.price]), [['mod_crate', MOD_CRATE_PRICE]]);
  for (const r of of('character')) assert.equal(r.price, 0, 'heroes are free');
  for (const r of of('weapon')) assert.equal(r.price, 0, 'weapons are free');
  for (const c of COSMETIC_LIST) { const r = rows.find((x) => x.type === 'cosmetic' && x.id === c.id); assert.equal(r.price, c.price); assert.equal(r.slot, c.slot); }
  for (const s of Object.values(SKINS)) { const r = rows.find((x) => x.type === 'skin' && x.id === s.id); assert.equal(r.price, s.price); assert.equal(r.parent, s.character); assert.equal(r.source, s.source); assert.equal(r.hidden, !!s.hidden); }
  for (const m of MOD_LIST) { const r = rows.find((x) => x.type === 'mod' && x.id === m.id); assert.equal(r.achievement, ACHIEVEMENT_MODS.has(m.id)); assert.deepEqual(r.weapons, m.weapons); }
  assert.equal(new Set(rows.map((r) => `${r.type}:${r.id}`)).size, rows.length, 'no duplicate keys');
  const secret = rows.find((r) => r.id === 'knight_arctic');
  assert.equal(secret.source, 'secret');
  assert.equal(secret.hidden, true);
});

test('catalog.sql is well formed (quotes escaped, brackets balanced)', () => {
  const sql = buildCatalogSql();
  const noComments = sql.replace(/--[^\n]*/g, '');
  assert.equal(noComments.split('(').length, noComments.split(')').length);
  assert.equal((noComments.match(/'/g) || []).length % 2, 0);
  assert.ok(sql.includes("array['snowball', 'candycane', 'iceblast', 'bomb']::text[]"), 'echo fits everything except bells');
});

// ---- the browser, the migration and the full schema agree with each other ----
test('every database function the browser calls exists, is granted to signed-in users, and is in schema.sql too', () => {
  const online = read('src/lib/backend/online.js');
  const names = [...online.matchAll(/rpc\('([a-z_]+)'/g)].map((m) => m[1]).filter((n) => n !== 'username_available');
  assert.deepEqual([...new Set(names)].sort(), ['shop_buy', 'shop_equip_character', 'shop_equip_cosmetic', 'shop_equip_loadout', 'shop_equip_title', 'shop_open_crate', 'shop_set_boost', 'start_run_me']);
  const update = read('supabase/update-6-fast-actions.sql');
  const schema = read('supabase/schema.sql');
  for (const n of new Set(names)) {
    assert.match(update, new RegExp(`create or replace function public\\.${n}\\(`), `${n} defined`);
    assert.match(update, new RegExp(`to authenticated;`));
    assert.ok(new RegExp(`grant execute on function[^;]*public\\.${n}\\(`).test(update), `${n} granted to authenticated`);
    assert.ok(!new RegExp(`grant execute on function[^;]*public\\.${n}\\([^;]*to anon`).test(update), `${n} not granted to anon`);
    assert.match(schema, new RegExp(`create or replace function public\\.${n}\\(`), `${n} also in schema.sql`);
  }
  const body = update.split('-- =====================================================================\n')[2];
  assert.ok(schema.includes(body.trim().slice(0, 4000)), 'schema.sql carries the same fast-action code');
});

test('database functions identify the player with auth.uid(), never a parameter', () => {
  const update = read('supabase/update-6-fast-actions.sql');
  const fns = update.split(/create or replace function /).slice(1).filter((f) => /^public\.(shop_|start_run_me)/.test(f));
  assert.equal(fns.length, 8);
  for (const f of fns) {
    assert.match(f, /uid uuid := auth\.uid\(\)/, f.slice(0, 40));
    assert.match(f, /not_signed_in/);
    assert.ok(!/\(\s*p_user\b/.test(f.split('returns')[0]), 'no user-id parameter');
    assert.match(f, /security definer set search_path = public/);
  }
  assert.ok(!/grant execute[^;]*to anon/.test(update));
});

test('the Netlify functions are still there as the fallback', () => {
  for (const f of ['inventory', 'start-run']) assert.ok(fs.existsSync(new URL(`../netlify/functions/${f}.js`, import.meta.url)));
  const online = read('src/lib/backend/online.js');
  assert.ok(online.includes("call('inventory', { action: 'buy'") && online.includes("call('start-run'"));
});
