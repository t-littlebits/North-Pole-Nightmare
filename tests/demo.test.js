import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const { demo } = await import('../src/lib/backend/demo.js');
const { clock } = await import('../src/lib/clock.js');

test('demo backend: full player journey', async () => {
  await assert.rejects(() => demo.signUp({ username: 'x' }));
  await demo.signUp({ username: 'Gerard_1' });
  await assert.rejects(() => demo.signUp({ username: 'gerard_1' }), /taken/);
  let me = await demo.getMe();
  assert.equal(me.profile.coins, 0);
  assert.ok(me.inventory.some((i) => i.item_id === 'santa'));

  await assert.rejects(() => demo.startRun('snowman'), /not unlocked/);
  const { runId } = await demo.startRun('santa');
  await assert.rejects(() => demo.submitRun(runId, { killPoints: 99999, kills: 5, bosses: 0, wave: 1, seconds: 3, presents: 0 }), /rejected/);
  const second = await demo.startRun('santa');
  await assert.rejects(() => demo.submitRun(runId, {}), /already/); // old ticket is dead
  // the demo clock can't be fast-forwarded: claim a plausible tiny run
  const res = await demo.submitRun(second.runId, { killPoints: 0, kills: 0, bosses: 0, wave: 1, seconds: 0, presents: 0 });
  assert.equal(res.score, 0);
  const lb = await demo.getLeaderboard(5);
  assert.equal(lb[0].username, 'FrostyMcBot');
});

test('demo backend: advent past/future rules + shop', async () => {
  clock.set('2026-12-03T10:00:00Z');
  let r = await demo.claimDay(1);                // missed door, claimable
  assert.equal(r.reward.day, 1);
  await assert.rejects(() => demo.claimDay(1), /Already/);
  await demo.claimDay(3);
  await assert.rejects(() => demo.claimDay(4), /not opened/); // future
  await assert.rejects(() => demo.claimDay(24), /not opened/);
  let me = await demo.getMe();
  assert.equal(me.profile.coins, 105); // 100 advent + 5 from the first run
  assert.ok(me.inventory.some((i) => i.item_id === 'elf_candy'));
  await assert.rejects(() => demo.buy('character', 'snowman'), /Not enough/);
  await assert.rejects(() => demo.buy('skin', 'santa_gold'), /cannot be bought/); // advent exclusive
  clock.set('2026-12-24T00:00:00Z');
  await demo.claimDay(24);
  me = await demo.getMe();
  assert.ok(me.inventory.some((i) => i.item_id === 'santa_aurora'));
  assert.equal(me.profile.coins, 1105);
  await demo.buy('character', 'snowman');
  await demo.select({ character: 'elf', skin: 'elf_candy' });
  me = await demo.getMe();
  assert.equal(me.profile.equipped.elf, 'elf_candy');
  assert.equal(me.profile.coins, 605);
  clock.set(null);
});

test('demo backend: search', async () => {
  const hits = await demo.searchPlayers('frost');
  assert.equal(hits[0].username, 'FrostyMcBot');
  const p = await demo.getPlayer('gerard_1');
  assert.equal(p.profile.username, 'Gerard_1');
});
