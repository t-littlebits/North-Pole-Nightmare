import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'phaser') return { url: new URL('./tests/mocks/phaser.js', 'file://${process.cwd()}/').href, shortCircuit: true };
  return next(spec, ctx);
}`));

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.window = globalThis;

const { default: GameScene } = await import('../src/game/scenes/GameScene.js');
const { bus } = await import('../src/game/bus.js');
const { ARENAS, ARENA_IDS, randomArena } = await import('../src/data/arenas.js');
const modsData = await import('../src/data/mods.js');
const { MODS, MOD_LIST, MAX_SLOTS, canEquip, sanitizeLoadout, rollPresentMods, rollModDrop, MOD_CRATE_PRICE } = modsData;
const { ADVENT_REWARDS } = await import('../src/data/advent.js');
const { BOSSES, CHARACTERS } = await import('../src/data/catalog.js');
const { rollUpgrades, applyUpgrade } = await import('../src/data/upgrades.js');
const { TITLES, evaluateTitles, TITLE_BY_ID } = await import('../src/data/titles.js');
const { validateRun } = await import('../src/shared/rules.js');
const { demo } = await import('../src/lib/backend/demo.js');
const { clock } = await import('../src/lib/clock.js');

const ALL_WEAPONS = ['snowball', 'candycane', 'iceblast', 'bells', 'bomb'];

function make(character = 'santa', extra = {}) {
  globalThis.__runConfig = { character, skin: `${character}_classic`, boost: null, unlockedWeapons: ALL_WEAPONS, runId: 'x', ...extra };
  const s = new GameScene();
  s.init(); s.create();
  s.t = 0;
  return s;
}
// Drive the scene like a player would: stay alive, pick upgrades, use the special, keep enemies close.
function drive(s, seconds, { pull = true } = {}) {
  for (let i = 0; i < seconds * 60 && !s.ended; i++) {
    s.t += 16;
    s.stats.hp = s.stats.maxHp;
    if (s.cards.length) s.chooseUpgrade(0);
    if (i % 120 === 0) s.trySpecial();
    s.update(s.t, 16);
    s.runOverlaps();
    if (pull) for (const e of s.enemies.getChildren().slice()) if (e.active && !e.boss && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 800) { e.x = s.player.x + 14; e.y = s.player.y + 4; }
  }
}

for (const id of ARENA_IDS) {
  test(`arena ${id} is purely cosmetic and runs`, () => {
    const s = make('santa', { arena: id });
    assert.equal(s.arena.id, id);
    drive(s, 70);
    assert.ok(s.run.wave >= 2 && s.run.kills > 0);
    // no gimmicks: nothing arena-specific changes the rules
    for (const k of ['ice', 'sticky', 'bias', 'ghostFrom', 'xpBonus', 'dark', 'unlockWave']) assert.equal(ARENAS[id][k], undefined, k);
  });
}

test('arena choice is random and always valid', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(randomArena());
  assert.equal(seen.size, ARENA_IDS.length);
  assert.equal(randomArena(() => 0), ARENA_IDS[0]);
  assert.equal(randomArena(() => 0.999999), ARENA_IDS[ARENA_IDS.length - 1]);
});

test('enemy mix is identical in every arena', () => {
  for (const id of ARENA_IDS) {
    const s = make('santa', { arena: id });
    const seen = new Set(); for (let i = 0; i < 400; i++) seen.add(s.pickType());
    assert.ok(!seen.has('ghost'), `${id}: no ghosts before wave 7`);
  }
});

for (const ch of ['snowman', 'reindeer', 'knight']) {
  test(`new ${ch} ability fires and cleans up`, () => {
    const s = make(ch);
    for (let i = 0; i < 40; i++) s.spawnEnemy('snowman', s.player.x + 60 + i, s.player.y + 20);
    s.sp.cd = 0; s.trySpecial();
    const id = CHARACTERS[ch].ability.id;
    if (id === 'blizzardstorm') assert.ok(s.storm);
    if (id === 'rednosebeam') assert.ok(s.beam);
    if (id === 'garrison') assert.equal(s.allies.length, 3);
    const hpBefore = s.enemies.getChildren().reduce((a, e) => a + e.hp, 0);
    drive(s, 9, { pull: false });
    const hpAfter = s.enemies.getChildren().filter((e) => e.active).reduce((a, e) => a + e.hp, 0);
    assert.ok(s.run.kills > 0 || hpAfter < hpBefore, 'ability dealt damage');
    assert.equal(s.storm, null); assert.equal(s.beam, null); assert.equal(s.allies.length, 0);
  });
}

// ---------------- weapon mods (equippable collection) ----------------
const compatible = (modId) => ['snowball', 'candycane', 'iceblast', 'bells', 'bomb'].filter((w) => canEquip(modId, w));

test('mod catalogue: every mod fits something, has a source, and none boost stats', () => {
  assert.equal(MOD_LIST.length, 15);
  const titleMods = new Set(TITLES.map((t) => t.mod).filter(Boolean));
  const adventMods = new Set(ADVENT_REWARDS.flatMap((r) => r.grants).filter((g) => g.type === 'mod').map((g) => g.id));
  for (const m of MOD_LIST) {
    assert.ok(compatible(m.id).length > 0, `${m.id} fits a weapon`);
    assert.ok(titleMods.has(m.id) || adventMods.has(m.id), `${m.id} can be earned deterministically`);
    assert.ok(!/\bdamage\b|attack speed|\bXP\b/i.test(m.desc.replace(/\(no damage\)/i, '')), `${m.id} must not promise stat boosts`);
  }
  for (const id of titleMods) assert.ok(MODS[id], id);
  assert.ok(!canEquip('echo', 'bells'));
  assert.ok(canEquip('gust', 'bells') && canEquip('gust', 'bomb'));
  assert.ok(!canEquip('ricochet', 'bomb'));
});

test('loadout sanitising: slots, ownership, compatibility, duplicates', () => {
  const owned = new Set(['gust', 'frost', 'snare', 'stun', 'echo', 'ricochet']);
  const out = sanitizeLoadout({ snowball: ['gust', 'gust', 'frost', 'snare', 'stun'], bells: ['echo', 'gust'], bomb: ['ricochet', 'hack'], nonsense: ['gust'] }, owned);
  assert.deepEqual(out.snowball, ['gust', 'frost', 'snare']);   // no duplicate, max 3
  assert.deepEqual(out.bells, ['gust']);                         // echo does not fit bells
  assert.equal(out.bomb, undefined);                             // ricochet does not fit bombs; unknown ids dropped
  assert.equal(out.nonsense, undefined);
  assert.deepEqual(sanitizeLoadout({ snowball: ['seeker'] }, new Set()), {});   // not owned -> nothing
  assert.deepEqual(sanitizeLoadout(null), {});
  assert.deepEqual(sanitizeLoadout({ snowball: ['gust'] }, owned, new Set(['bomb'])), {}); // weapon not owned
});

test('present mod drops: tiny chance, never a duplicate, capped by what is left', () => {
  assert.deepEqual(rollPresentMods(10, new Set(), () => 0.5), []);              // 50% roll > 2% rate: nothing
  const got = rollPresentMods(5, new Set(), () => 0);                          // every roll succeeds
  assert.equal(got.length, 5); assert.equal(new Set(got).size, 5);
  const almost = new Set(MOD_LIST.map((m) => m.id)); almost.delete('echo');
  assert.deepEqual(rollPresentMods(10, almost, () => 0), ['echo']);            // only one left to find
  assert.deepEqual(rollPresentMods(10, new Set(MOD_LIST.map((m) => m.id)), () => 0), []);
  let hits = 0; for (let i = 0; i < 20000; i++) if (rollPresentMods(1, new Set()).length) hits++;
  assert.ok(hits > 200 && hits < 700, `about 2% of presents drop a mod (got ${hits}/20000)`);
  assert.equal(rollModDrop(new Set(MOD_LIST.map((m) => m.id))), null);
});

test('mods in the run: loadout comes from the config and is sanitised', () => {
  const s = make('santa', { loadout: { snowball: ['gust', 'echo', 'frost', 'stun'], bells: ['echo'] } });
  assert.deepEqual(s.mods.snowball, ['gust', 'echo', 'frost']);
  assert.equal(s.mods.bells, undefined);
});

for (const m of MOD_LIST) {
  for (const w of compatible(m.id)) {
    test(`mod ${m.id} on ${w} runs in-game`, () => {
      const s = make('santa', { loadout: { [w]: [m.id] } });
      s.weapons = { [w]: 4 };
      drive(s, 20);
      assert.ok(s.run.kills > 0, 'weapon still kills things');
    });
  }
}

test('three mods can be stacked on one weapon without breaking it', () => {
  const s = make('santa', { loadout: { snowball: ['seeker', 'ricochet', 'echo'], iceblast: ['deepfreeze', 'lingering', 'gust'] } });
  s.weapons = { snowball: 5, iceblast: 5 };
  drive(s, 30);
  assert.ok(s.run.kills > 0);
});

test('echo: every 5th attack is repeated once', () => {
  const s = make('santa', { loadout: { snowball: ['echo'] } });
  s.weapons = { snowball: 1 };
  let calls = 0;
  s.fire_snowball = () => { calls += 1; return true; };
  drive(s, 40, { pull: false });
  const attacks = s.atkCount.snowball;
  assert.ok(attacks >= 20, `plenty of attacks (${attacks})`);
  const echoes = Math.floor(attacks / 5);
  assert.ok(calls === attacks + echoes || calls === attacks + echoes - 1, `calls ${calls} = attacks ${attacks} + echoes ${echoes}`);
  const plain = make('santa');
  plain.weapons = { snowball: 1 }; let c2 = 0; plain.fire_snowball = () => { c2 += 1; return true; };
  drive(plain, 40, { pull: false });
  assert.equal(c2, plain.atkCount.snowball, 'without echo there are no extra attacks');
});

test('proc mods: knockback, slow, stun and snare behave as described', () => {
  const real = Math.random;
  try {
    Math.random = () => 0; // every chance succeeds
    const s = make('santa', { loadout: { snowball: ['gust', 'frost', 'stun'], bells: ['snare'] } });
    const e = s.spawnEnemy('snowman', s.player.x + 100, s.player.y);
    s.weaponProc('snowball', e);
    assert.ok(e.kUntil > s.runMs, 'gust knocks back');
    assert.ok(e.slowUntil > s.runMs, 'frost slows');
    assert.ok(e.frozenUntil > s.runMs, 'stun stops a normal enemy');
    const snared = s.spawnEnemy('snowman', s.player.x + 100, s.player.y);
    s.weaponProc('bells', snared);
    assert.ok(snared.snareUntil > s.runMs, 'snare slows to a crawl');
    const boss = s.spawnEnemy('snowman', s.player.x + 100, s.player.y); boss.boss = true;
    s.weaponProc('snowball', boss);
    assert.ok(!boss.frozenUntil, 'bosses ignore stun');
    const bossSnare = s.spawnEnemy('snowman', s.player.x + 100, s.player.y); bossSnare.boss = true;
    s.weaponProc('bells', bossSnare);
    assert.ok(!bossSnare.snareUntil, 'bosses ignore snare');
    const other = s.spawnEnemy('snowman', s.player.x + 100, s.player.y);
    s.weaponProc('bomb', other);   // the bomb has no mods equipped
    assert.ok(!other.kUntil && !other.slowUntil, 'mods only affect the weapon they are equipped on');
    Math.random = () => 0.99;      // every chance fails
    const calm = s.spawnEnemy('snowman', s.player.x + 100, s.player.y);
    s.weaponProc('snowball', calm);
    assert.ok(!calm.kUntil && !calm.frozenUntil && !calm.snareUntil);
  } finally { Math.random = real; }
});

test('mods never change weapon damage numbers', () => {
  const plain = make('santa'); const modded = make('santa', { loadout: { snowball: ['gust', 'frost', 'seeker'], bomb: ['gravity', 'glaze'] } });
  const hp = [];
  for (const s of [plain, modded]) {
    s.stats.crit = 0;
    const e = s.spawnEnemy('snowman', s.player.x + 200, s.player.y);
    const bullet = s.spawnSnowball(s.player.x, s.player.y, 0, 8, {});
    s.lastCrit = false; s.onBulletHit(bullet, e);
    hp.push(e.maxHp - e.hp);
  }
  assert.equal(hp[0], hp[1]);
});

// ---------------- bosses ----------------
for (let i = 0; i < BOSSES.length; i++) {
  test(`boss ${BOSSES[i].id}: telegraphs, patterns and phase 2`, () => {
    const s = make('santa');
    s.run.wave = (i + 1) * 5 - 1; s.waveMs = 29990; // next tick starts the boss wave
    const events = []; const off = [bus.on('bossphase', (d) => events.push(d)), bus.on('boss', (d) => events.push(['boss', d]))];
    drive(s, 1, { pull: false });
    const boss = s.boss;
    assert.ok(boss && boss.active, 'boss spawned');
    assert.equal(boss.bossDef.id, BOSSES[i].id);
    // run every pattern for both phases by hand to be sure none throws
    for (const phase of [1, 2]) {
      boss.phase = phase;
      for (const mv of boss.bossDef.moves[phase]) { s.player.x = boss.x + 200; s[`bm_${mv}`](boss, 1, 0); drive(s, 3, { pull: false }); }
    }
    boss.phase = 1; boss.hp = boss.maxHp; boss.invulnUntil = 0; boss.bossWind = 0; boss.bossDash = null;
    boss.hp = boss.maxHp * 0.4;
    drive(s, 0.1, { pull: false });
    assert.equal(boss.phase, 2, 'entered phase 2');
    assert.ok(events.some((e) => e.phase === 2), 'phase event emitted');
    const hp = boss.hp; s.damageEnemy(boss, 50); // invulnerable right after the phase change
    assert.equal(boss.hp, hp, 'brief invulnerability');
    off.forEach((o) => o());
  });
}

test('boss hazards hurt only the player standing in them', () => {
  const s = make('santa');
  s.stats.hp = s.stats.maxHp = 500;
  s.telegraph(s.player.x + 400, s.player.y, 60, 100, 30);
  s.telegraph(s.player.x, s.player.y, 60, 100, 30);
  const before = s.stats.hp;
  for (let i = 0; i < 20; i++) { s.t += 16; s.update(s.t, 16); }
  assert.ok(s.stats.hp < before, 'standing in the circle hurts');
  assert.equal(s.hazards.length, 0);
});

test('validator allows boss minion spawns', () => {
  const stats = { killPoints: 6000, kills: 700, bosses: 2, wave: 11, seconds: 330, presents: 12 };
  assert.ok(validateRun(stats, 340).ok);
});

// ---------------- titles ----------------
test('titles: stat thresholds, manual titles never auto-granted', () => {
  assert.deepEqual(evaluateTitles({}), []);
  assert.ok(evaluateTitles({ games_played: 1 }).includes('fresh_snowflake'));
  const all = evaluateTitles({ games_played: 99, total_kills: 99999, best_wave: 30, bosses_defeated: 99, best_score: 99999, presents_opened: 999, total_seconds: 99999, advent_claims: 24, heroes_owned: 5, skins_owned: 16 });
  assert.equal(all.length, TITLES.filter((t) => !t.manual).length);
  assert.ok(!all.includes('owner') && !all.includes('founder'));
  assert.ok(TITLE_BY_ID.owner.manual);
  assert.equal(new Set(TITLES.map((t) => t.id)).size, TITLES.length);
});

test('demo backend: titles awarded, equipped, owner title (demo)', async () => {
  await demo.resetAll();
  await demo.signUp({ username: 'TitleTester' });
  let me = await demo.getMe();
  assert.deepEqual(me.titles, []);
  const { runId } = await demo.startRun('santa');
  const r = await demo.submitRun(runId, { killPoints: 0, kills: 0, bosses: 0, wave: 1, seconds: 0, presents: 0 });
  assert.deepEqual(r.newTitles, ['fresh_snowflake']);
  me = await demo.getMe();
  assert.equal(me.profile.equipped_title, 'fresh_snowflake'); // first title auto-equips
  await assert.rejects(() => demo.equipTitle('owner'), /not unlocked/);
  await demo.grantOwner();
  await demo.equipTitle('owner');
  const lb = await demo.getLeaderboard(50);
  me = await demo.getMe();
  assert.equal(me.profile.equipped_title, 'owner');
  assert.ok(me.titles.includes('owner'));
  await demo.equipTitle(null);
  assert.equal((await demo.getMe()).profile.equipped_title, null);
  await demo.resetAll();
});

test('demo backend: present drops, equipping and run-start loadout', async () => {
  await demo.resetAll();
  await demo.signUp({ username: 'ModTester' });
  let me = await demo.getMe();
  assert.equal(me.inventory.filter((i) => i.item_type === 'mod').length, 0);
  await assert.rejects(() => demo.equipLoadout('snowball', ['gust']), /not unlocked/);
  let { runId, loadout } = await demo.startRun('santa');
  assert.deepEqual(loadout, {});
  // two presents, every roll succeeds -> the "server" drops two mods (deterministic: first two by catalogue order)
  const real = Math.random; Math.random = () => 0;
  let r;
  try { r = await demo.submitRun(runId, { killPoints: 0, kills: 0, bosses: 0, wave: 1, seconds: 0, presents: 2 }); } finally { Math.random = real; }
  assert.deepEqual(r.presentMods, ['gust', 'frost']);
  me = await demo.getMe();
  const owned = me.inventory.filter((i) => i.item_type === 'mod').map((i) => i.item_id);
  assert.deepEqual(owned.sort(), ['frost', 'gust']);
  await assert.rejects(() => demo.equipLoadout('snowball', ['gust', 'gust']), /slots/);
  await assert.rejects(() => demo.equipLoadout('snowball', ['gust', 'frost', 'snare', 'stun']), /slots/);
  await assert.rejects(() => demo.equipLoadout('snowball', ['seeker']), /not unlocked/);   // not owned
  await assert.rejects(() => demo.equipLoadout('bells', ['gust']), /weapon/);              // bells not unlocked yet
  await demo.equipLoadout('snowball', ['gust', 'frost']);
  ({ runId, loadout } = await demo.startRun('santa'));
  assert.deepEqual(loadout, { snowball: ['gust', 'frost'] });
  await demo.equipLoadout('snowball', []);
  assert.deepEqual((await demo.startRun('santa')).loadout, {});
});

test('demo backend: advent mods, Mod Crate, title-reward mods', async () => {
  await demo.resetAll();
  await demo.signUp({ username: 'CrateTester' });
  await assert.rejects(() => demo.buyModCrate(), /Not enough coins/);
  clock.set('2026-12-12T09:00:00Z');
  for (let d = 1; d <= 12; d++) await demo.claimDay(d);     // doors 4 and 9 hold mods; bells weapon is door 5
  let me = await demo.getMe();
  const modsOf = () => me.inventory.filter((i) => i.item_type === 'mod').map((i) => i.item_id);
  assert.deepEqual(modsOf().sort(), ['glaze', 'hook']);
  assert.equal(me.profile.coins, 750);
  await demo.equipLoadout('bells', []);                      // bells unlocked from the calendar
  await assert.rejects(() => demo.equipLoadout('candycane', ['hook', 'glaze']), /fit/);   // glaze is a bomb mod
  await demo.equipLoadout('candycane', ['hook']);
  const crate = await demo.buyModCrate();
  me = await demo.getMe();
  assert.ok(MODS[crate.mod]); assert.ok(!['glaze', 'hook'].includes(crate.mod));
  assert.equal(me.profile.coins, 750 - MOD_CRATE_PRICE);
  assert.equal(modsOf().length, 3);
  clock.set(null);
  // 10 finished runs earn the Regular Reveller title, which unlocks the Wind Gust mod
  let newMods = [];
  for (let i = 0; i < 10; i++) {
    const { runId } = await demo.startRun('santa');
    const res = await demo.submitRun(runId, { killPoints: 0, kills: 0, bosses: 0, wave: 1, seconds: 0, presents: 0 });
    newMods = newMods.concat(res.newMods);
  }
  me = await demo.getMe();
  assert.ok(me.titles.includes('regular_reveller'));
  assert.ok(modsOf().includes('gust'));
  assert.ok(newMods.includes('gust') || crate.mod === 'gust');
  // feedback
  await assert.rejects(() => demo.sendFeedback({ kind: 'bug', message: 'hi' }), /little more/);
  await assert.rejects(() => demo.sendFeedback({ kind: 'bug', message: 'x'.repeat(1001) }), /1000/);
  assert.deepEqual(await demo.sendFeedback({ kind: 'suggestion', message: 'Add more snow please' }), { ok: true });
  assert.equal(JSON.parse(store.get('npn.demo.feedback')).at(-1).kind, 'suggestion');
  await demo.resetAll();
});
