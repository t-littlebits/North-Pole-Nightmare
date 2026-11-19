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
const { MODS, MOD_LIST, MAX_SLOTS, canEquip, sanitizeLoadout, rollPresentMods, rollModDrop, MOD_CRATE_PRICE, ACHIEVEMENT_MODS } = modsData;
const { saveSettings } = await import('../src/lib/settings.js');
const { SPRITES } = await import('../src/game/sprites.js');
const { WEAPONS, CHARACTER_IDS, ENEMIES, MAX_POINTS_PER_KILL, MAX_WEAPON_LEVEL } = await import('../src/data/catalog.js');
const { enemyHpScale, enemyDmgScale } = await import('../src/shared/rules.js');
const { ADVENT_REWARDS } = await import('../src/data/advent.js');
const { BOSSES, CHARACTERS } = await import('../src/data/catalog.js');
const { rollUpgrades, applyUpgrade, STAT_UPGRADES, FINISHERS, CAPS, isMaxed, describeCard } = await import('../src/data/upgrades.js');
const { COSMETICS, COSMETIC_LIST, COSMETIC_SLOTS, sanitizeCosmetics } = await import('../src/data/cosmetics.js');
const { SKINS, isSkinVisible } = await import('../src/data/catalog.js');
const { SKIN_ART, skinRows } = await import('../src/game/sprites.js');
import fs from 'node:fs';
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

test('random drops never give a mod that an achievement can award', () => {
  const nonAchievement = MOD_LIST.filter((m) => !ACHIEVEMENT_MODS.has(m.id)).map((m) => m.id);
  assert.deepEqual(nonAchievement.sort(), ['chime', 'glaze', 'hook', 'lingering']);
  for (let i = 0; i < 500; i++) assert.ok(nonAchievement.includes(rollModDrop(new Set())));
  const got = rollPresentMods(50, new Set(), () => 0);          // every roll succeeds
  assert.deepEqual(got.sort(), nonAchievement);                  // exactly the 4 luck-only mods, no duplicates
  assert.deepEqual(rollModDrop(new Set(nonAchievement)), null);  // nothing left for the crate to give
  for (const t of TITLES) if (t.mod) assert.ok(ACHIEVEMENT_MODS.has(t.mod));
});

test('present mod drops: tiny chance, never a duplicate', () => {
  assert.deepEqual(rollPresentMods(10, new Set(), () => 0.5), []);                       // 50% roll > 2% rate: nothing
  const nearly = new Set(['hook', 'lingering', 'glaze']);
  assert.deepEqual(rollPresentMods(10, nearly, () => 0), ['chime']);                     // only one left to find
  let hits = 0; for (let i = 0; i < 20000; i++) if (rollPresentMods(1, new Set()).length) hits++;
  assert.ok(hits > 200 && hits < 700, `about 2% of presents drop a mod (got ${hits}/20000)`);
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
  assert.deepEqual(r.presentMods, ['hook', 'lingering']);
  me = await demo.getMe();
  const owned = me.inventory.filter((i) => i.item_type === 'mod').map((i) => i.item_id);
  assert.deepEqual(owned.sort(), ['hook', 'lingering']);
  await assert.rejects(() => demo.equipLoadout('snowball', ['hook', 'hook']), /slots/);
  await assert.rejects(() => demo.equipLoadout('snowball', ['gust', 'frost', 'snare', 'stun']), /slots/);
  await assert.rejects(() => demo.equipLoadout('snowball', ['seeker']), /not unlocked/);   // not owned
  await assert.rejects(() => demo.equipLoadout('snowball', ['hook']), /fit/);               // hook is a candy cane mod
  await demo.equipLoadout('candycane', ['hook']);
  await demo.equipLoadout('iceblast', ['lingering']);
  ({ runId, loadout } = await demo.startRun('santa'));
  assert.deepEqual(loadout, { candycane: ['hook'], iceblast: ['lingering'] });
  await demo.equipLoadout('candycane', []); await demo.equipLoadout('iceblast', []);
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
  assert.equal(me.profile.coins, 1350);
  await demo.equipLoadout('bells', []);                      // bells are free from the start
  await assert.rejects(() => demo.equipLoadout('candycane', ['hook', 'glaze']), /fit/);   // glaze is a bomb mod
  await demo.equipLoadout('candycane', ['hook']);
  const crate = await demo.buyModCrate();
  me = await demo.getMe();
  assert.ok(['lingering', 'chime'].includes(crate.mod), 'crate only gives luck-only mods you do not own');
  assert.equal(me.profile.coins, 1350 - MOD_CRATE_PRICE);
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
  assert.ok(newMods.includes('gust'));
  // feedback
  await assert.rejects(() => demo.sendFeedback({ kind: 'bug', message: 'hi' }), /little more/);
  await assert.rejects(() => demo.sendFeedback({ kind: 'bug', message: 'x'.repeat(1001) }), /1000/);
  assert.deepEqual(await demo.sendFeedback({ kind: 'suggestion', message: 'Add more snow please' }), { ok: true });
  assert.equal(JSON.parse(store.get('npn.demo.feedback')).at(-1).kind, 'suggestion');
  await demo.resetAll();
});

test('heroes and weapons are free for everyone', async () => {
  for (const c of CHARACTER_IDS) assert.equal(CHARACTERS[c].price, 0, c);
  for (const w of Object.values(WEAPONS)) assert.equal(w.price, 0, w.id);
  await demo.resetAll();
  await demo.signUp({ username: 'FreeForAll' });
  for (const c of CHARACTER_IDS) assert.ok((await demo.startRun(c)).runId, c);
  await demo.equipLoadout('bomb', ['glaze']).catch((e) => assert.match(e.message, /unlocked/));   // free weapon, but the mod is not owned
  await assert.rejects(() => demo.buy('weapon', 'bomb'), /cannot be bought/);
  for (const r of ADVENT_REWARDS) for (const g of r.grants) assert.ok(g.type !== 'character' && g.type !== 'weapon', `advent day ${r.day} no longer gives free things`);
  await demo.resetAll();
});

test('no sprite has a floating pixel (hats, pom-poms, ears are all attached)', () => {
  for (const [name, spr] of Object.entries(SPRITES)) {
    const R = spr.rows;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      if (R[y][x] === '.') continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && R[y + dy]?.[x + dx] && R[y + dy][x + dx] !== '.') n++;
      assert.ok(n > 0, `${name}: floating pixel at ${x},${y}`);
    }
  }
  // Santa's pom-pom (white) must sit right beside the red hat tip
  assert.equal(SPRITES.santa.rows[1].slice(9, 11), 'RW');
});

// ---------------- mouse aiming ----------------
test('mouse aim: attacks follow the cursor; off by default; auto-aim until a mouse is seen', () => {
  const off = make('santa');
  assert.equal(off.aiming(), false);
  off.weapons = { snowball: 1 };
  assert.equal(off.fire_snowball(1), false, 'auto-aim needs an enemy');

  saveSettings({ mouseAim: true });
  try {
    const s = make('santa');
    s.weapons = { snowball: 1, candycane: 1, bomb: 1 };
    assert.equal(s.aiming(), false, 'no mouse movement seen yet (e.g. touch screen): stays on auto-aim');
    assert.equal(s.fire_snowball(1), false);
    s.mouseSeen = true;
    assert.equal(s.aiming(), true);
    s.input.activePointer = { x: 700, y: 100, wasTouch: false };
    s.cameras.main.scrollX = 400; s.cameras.main.scrollY = 600;      // cursor in world space = (1100, 700)
    const aim = s.aimPoint();
    assert.deepEqual(aim, { x: 1100, y: 700 });
    const angles = [];
    s.spawnSnowball = (x, y, a) => { angles.push(a); return {}; };
    assert.equal(s.fire_snowball(1), true, 'fires with no enemies when aimed');
    assert.ok(Math.abs(angles[0] - Math.atan2(700 - s.player.y, 1100 - s.player.x)) < 1e-9, 'fires toward the cursor');
    const hits = [];
    s.detonate = (x, y) => hits.push([x, y]);
    s.player.x = 1000; s.player.y = 700;
    s.input.activePointer = { x: 600, y: 100, wasTouch: false }; // world (1000, 700) minus... aim straight at the player's own spot + 0
    s.cameras.main.scrollX = 800; s.cameras.main.scrollY = 600;  // world (1400, 700): 400px to the right
    s.fire_bomb(1);
    assert.ok(hits.length === 1 && Math.abs(hits[0][0] - 1400) < 1 && Math.abs(hits[0][1] - 700) < 1, 'bomb lands on the cursor');
    s.input.activePointer = { x: 1900, y: 100, wasTouch: false }; // far away: world (2700, 700)
    hits.length = 0; s.fire_bomb(1);
    assert.ok(Math.abs(hits[0][0] - (1000 + 460)) < 1, 'bomb range is capped at 460px');
    // dashes follow the cursor too
    s.input.activePointer = { x: 600, y: 700 - 600, wasTouch: false };
    s.cameras.main.scrollX = 400; s.cameras.main.scrollY = 600;   // world (1000, 700) == player: degenerate; aim left instead
    s.input.activePointer = { x: 0, y: 100, wasTouch: false };    // world (400, 700): straight left
    const el = make('elf');
    el.mouseSeen = true; el.input.activePointer = { x: 0, y: 300, wasTouch: false }; el.cameras.main.scrollX = 400; el.cameras.main.scrollY = 600;
    el.player.x = 1000; el.player.y = 900;
    el.sp.cd = 0; el.trySpecial();
    assert.ok(el.dash.vx < 0 && Math.abs(el.dash.vy) < 1, 'jingle dash goes toward the cursor');
    drive(s, 5, { pull: false });  // keeps running with the crosshair on
  } finally { saveSettings({ mouseAim: false }); }
});

// ---------------- balance ----------------
test('balance: enemy health outpaces the old curve and keeps growing', () => {
  const old = (w) => 1 + (w - 1) * 0.16 + Math.pow(w, 1.3) * 0.02;
  for (let w = 2; w <= 40; w++) { assert.ok(enemyHpScale(w) > old(w), `wave ${w}`); assert.ok(enemyHpScale(w) > enemyHpScale(w - 1)); }
  assert.ok(enemyHpScale(20) > 6.5 && enemyDmgScale(10) > 1.5);
  const s = make('santa'); s.run.wave = 12;
  const e = s.spawnEnemy('snowman', 100, 100);
  assert.ok(Math.abs(e.maxHp - ENEMIES.snowman.hp * enemyHpScale(12)) < 1e-6);
});

test('balance: every enemy (even elite) stays inside the per-kill score limit the server checks', () => {
  for (const d of Object.values(ENEMIES)) assert.ok(d.pts * 3 <= MAX_POINTS_PER_KILL, d.id);
});

test('balance: bells no longer knock enemies away or grow past four bells', () => {
  const s = make('santa');
  s.weapons = { bells: MAX_WEAPON_LEVEL };
  const e = s.spawnEnemy('snowman', s.player.x + 10, s.player.y);
  for (let i = 0; i < 120; i++) { s.t += 16; s.runMs += 16; s.updateBells(0.016); e.x = s.bells[0].x; e.y = s.bells[0].y; }
  assert.equal(s.bells.length, 2 + Math.floor((MAX_WEAPON_LEVEL - 1) / 3), 'bell count at the weapon level cap');
  assert.ok(!e.kUntil, 'no knockback from the bells themselves');
  assert.ok(e.hp < e.maxHp, 'but they still hurt');
  const chime = make('santa', { loadout: { bells: ['chime'] } });
  chime.weapons = { bells: MAX_WEAPON_LEVEL };
  const far = chime.spawnEnemy('snowman', chime.player.x + 60, chime.player.y);
  chime.runMs = 5000; chime.updateBells(0.016);
  assert.ok(far.kUntil > chime.runMs, 'the Chime Wave mod is now the only bell knockback');
});

test('balance: armor and regeneration are capped, level-up heal is small', () => {
  const stats = { maxHp: 100, hp: 100, speed: 100, atk: 1, dmg: 1, pickup: 60, regen: 0, crit: 0, xpMult: 1, armor: 0, cdr: 0, proj: 0, luck: 0 };
  for (let i = 0; i < 30; i++) { applyUpgrade({ kind: 'stat', id: 'armor', mult: 4 }, stats, {}); applyUpgrade({ kind: 'stat', id: 'regen', mult: 4 }, stats, {}); }
  assert.equal(stats.armor, 5); assert.equal(stats.regen, 2.5);
  const s = make('santa'); s.stats.hp = 50;
  s.startLevelUp(); s.chooseUpgrade(0);
  assert.ok(Math.abs(s.stats.hp - (50 + s.stats.maxHp * 0.05)) < 1e-6 || s.stats.hp <= 50 + s.stats.maxHp * 0.1 + 12);
});

// ---------------- ranged enemy ----------------
test('nutcracker gunner: keeps its distance, retreats when crowded, and only shoots on screen', () => {
  const s = make('santa');
  const px = s.player.x, py = s.player.y;
  const far = s.spawnEnemy('nutcracker', px + 900, py);          // far off screen
  drive(s, 3, { pull: false });
  assert.equal(s.eshots.getLength(), 0, 'no shots from off-screen enemies');
  assert.ok(far.body.velocity.x < 0, 'it walks toward the player');
  far.destroy();

  const close = s.spawnEnemy('nutcracker', px + 120, py);        // too close: backs away
  s.update(s.t + 16, 16);
  assert.ok(close.body.velocity.x > 0, 'retreats from a crowding player');
  close.destroy();

  const mid = s.spawnEnemy('nutcracker', px + 280, py);          // comfortable range: strafes and shoots
  mid.nextFire = 0;
  s.stats.maxHp = s.stats.hp = 100000;                           // survive the shots so we can count them
  s.update(s.t + 16, 16);
  assert.ok(mid.fireWind > 0, 'telegraphs with a flash first');
  drive(s, 1, { pull: false });
  assert.ok(s.eshots.getLength() > 0 || s.stats.hp < 100000, 'then fires at the player');
  const shot = s.eshots.getChildren()[0];
  if (shot) assert.ok(shot.body.velocity.x < 0, 'aimed at the player');
});

test('nutcracker gunners appear from wave 4 and fire more shots later', () => {
  const s = make('santa');
  const seenEarly = new Set(); s.run.wave = 3; for (let i = 0; i < 600; i++) seenEarly.add(s.pickType());
  assert.ok(!seenEarly.has('nutcracker'));
  const seenLate = new Set(); s.run.wave = 6; for (let i = 0; i < 600; i++) seenLate.add(s.pickType());
  assert.ok(seenLate.has('nutcracker'));
  const e = s.spawnEnemy('nutcracker', s.player.x + 280, s.player.y);
  for (const [wave, n] of [[5, 1], [9, 2], [14, 3]]) {
    s.run.wave = wave; s.eshots.getChildren().slice().forEach((b) => b.destroy());
    s.shooterFire(e);
    assert.equal(s.eshots.getLength(), n, `wave ${wave} fires ${n}`);
  }
});

test('a long mixed run with the new enemy still validates server-side', () => {
  const s = make('santa');
  drive(s, 150);
  const stats = { killPoints: s.run.killPoints, kills: s.run.kills, bosses: s.run.bosses, wave: s.run.wave, seconds: Math.floor(s.runMs / 1000), presents: s.run.presents };
  assert.ok(validateRun(stats, stats.seconds + 2).ok);
});

// ---------------- boss fights feel like events ----------------
function startBossFight(wave = 4, character = 'santa') {
  const s = make(character);
  for (let i = 0; i < 30; i++) s.spawnEnemy('elf', s.player.x + 300 + i, s.player.y);
  s.run.wave = wave; s.waveMs = 29990;
  drive(s, 0.2, { pull: false });
  return s;
}
const regularCount = (s) => s.enemies.getChildren().filter((e) => e.active && !e.boss && !e.minion).length;

test('boss fight: the field is cleared and nothing regular spawns while the boss lives', () => {
  const s = startBossFight();
  const boss = s.boss;
  assert.ok(boss && boss.active);
  assert.equal(s.run.wave, 5);
  assert.equal(regularCount(s), 0, 'lesser enemies were cleared');
  assert.ok(s.gemList.length > 0, 'their XP was paid out as gems');
  assert.equal(s.run.kills, 0, 'clearing gives no kill credit');
  assert.equal(s.bossFight(), true);
  const clock0 = s.waveMs;
  drive(s, 60, { pull: false });
  assert.equal(s.run.wave, 5, 'waves do not progress during the fight');
  assert.equal(s.waveMs, clock0, 'the wave clock is frozen');
  assert.equal(regularCount(s), 0, 'no regular spawns during the fight');
});

test('boss fight: defeating the boss heals you, clears its adds and restarts the waves', () => {
  const s = startBossFight();
  const boss = s.boss;
  const events = []; const off = bus.on('bossdefeated', (d) => events.push(d));
  drive(s, 20, { pull: false });                       // let it summon a few adds
  s.stats.hp = 10; boss.invulnUntil = 0;
  s.damageEnemy(boss, 1e9);
  off();
  assert.equal(events.length, 1);
  assert.equal(s.run.bosses, 1);
  assert.equal(s.boss, null);
  assert.equal(s.bossFight(), false);
  assert.ok(s.stats.hp >= 10 + s.stats.maxHp * 0.4 - 1e-6, 'victory heal');
  assert.equal(s.enemies.getChildren().filter((e) => e.minion && e.active).length, 0, 'its adds vanish with it');
  drive(s, 40, { pull: false });
  assert.ok(s.run.wave >= 6, `waves resume (wave ${s.run.wave})`);
  assert.ok(regularCount(s) > 0, 'regular enemies spawn again');
});

test('boss fight: a very long stand-off lets the waves start again (no stalling forever)', () => {
  const s = startBossFight();
  assert.equal(s.bossFight(), true);
  s.bossFightMs = 95000;
  drive(s, 4, { pull: false });
  assert.equal(s.bossFight(), false);
  assert.ok(regularCount(s) > 0);
});

test('boss adds are capped so they never bury the boss', () => {
  const s = startBossFight(9);                         // wave 10 boss = Elf Overlord (summons elves)
  const boss = s.boss;
  assert.equal(boss.bossDef.id, 'elfoverlord');
  for (let i = 0; i < 12; i++) s.bm_summon(boss);
  const adds = s.enemies.getChildren().filter((e) => e.minion && e.active).length;
  assert.ok(adds > 0 && adds <= 6, `at most 6 adds (${adds})`);
});

// ---------------- red nose beam ----------------
test('red nose beam: screen-wide, two fast turns, one hit per pass even at long range', () => {
  const s = make('reindeer');
  const hits = new Map();
  s.damageEnemy = (e) => hits.set(e, (hits.get(e) || 0) + 1);
  const px = s.player.x, py = s.player.y;
  const below = s.spawnEnemy('snowman', px, py + 900);        // off screen (the view is only 540 tall)
  const left = s.spawnEnemy('snowman', px - 250, py);
  const edge = s.spawnEnemy('snowman', px + 30, py + 1250);   // very far: still inside the beam's reach
  const beyond = s.spawnEnemy('snowman', px - 30, py - 1450); // past the end of the beam
  s.facing = { x: 1, y: 0 };
  s.sp.cd = 0; s.trySpecial();
  assert.ok(s.beam);
  const t0 = s.runMs;
  for (let i = 0; i < 400 && s.beam; i++) { s.t += 16; s.update(s.t, 16); }
  const secs = (s.runMs - t0) / 1000;
  assert.ok(secs > 1.8 && secs < 2.2, `two turns at 6.4 rad/s take about 2 seconds (took ${secs})`);
  assert.equal(s.beam, null);
  assert.equal(hits.get(below), 2, 'hit once on each of the two passes, even 900px away');
  assert.equal(hits.get(left), 2);
  assert.equal(hits.get(edge), 2, 'reaches far off screen');
  assert.equal(hits.get(beyond), undefined, 'but not infinitely far');
});

test('red nose beam keeps working with every kind of enemy and boss in range', () => {
  const s = make('reindeer');
  for (const t of ['snowman', 'elf', 'gingerbread', 'reindeer', 'ghost', 'nutcracker']) s.spawnEnemy(t, s.player.x + 200, s.player.y + 40);
  s.run.wave = 5; s.waveMs = 29990; drive(s, 0.2, { pull: false });
  s.sp.cd = 0; s.trySpecial();
  drive(s, 4, { pull: false });
  assert.equal(s.beam, null);
});

// ---------------- upgrade limits ----------------
const maxEverything = (s) => {
  for (const u of STAT_UPGRADES) for (let i = 0; i < 80; i++) applyUpgrade({ kind: 'stat', id: u.id, mult: 4 }, s.stats, s.weapons, s.cosmetics);
  for (const w of Object.keys(WEAPONS)) s.weapons[w] = MAX_WEAPON_LEVEL;
};

test('upgrade limits: every stat stops at its ceiling no matter how many legendary picks', () => {
  const s = make('santa');
  const st = s.stats, b = st.base;
  assert.ok(b && b.dmg === 1 && b.speed === 150);
  maxEverything(s);
  const near = (a, x) => assert.ok(Math.abs(a - x) < 1e-9, `${a} vs ${x}`);
  near(st.dmg, b.dmg * 1.6); near(st.atk, 1.5); near(st.speed, b.speed * 1.4); near(st.maxHp, b.maxHp * 2);
  near(st.pickup, b.pickup * 3); near(st.xpMult, b.xpMult * 1.6);
  near(st.regen, 2.5); near(st.crit, 0.3); near(st.armor, 5); near(st.cdr, 0.4); near(st.luck, 0.5); assert.equal(st.proj, 2);
  assert.ok(st.hp <= st.maxHp);
  for (const u of STAT_UPGRADES) assert.ok(isMaxed(u.id, st), `${u.id} is maxed`);
  assert.equal(Object.keys(CAPS).length, STAT_UPGRADES.length, 'every stat has a ceiling');
});

test('upgrade limits: weapons stop at the level cap', () => {
  assert.equal(MAX_WEAPON_LEVEL, 6);
  const w = { snowball: 5 };
  applyUpgrade({ kind: 'weapon', id: 'snowball', levels: 3 }, {}, w);
  assert.equal(w.snowball, MAX_WEAPON_LEVEL);
  const ctx = { wave: 10, luck: 0, weapons: { snowball: 6 }, available: ['snowball'], stats: null, cosmetics: new Set() };
  for (let i = 0; i < 200; i++) assert.ok(!rollUpgrades(ctx).some((c) => c.kind === 'weapon' && c.id === 'snowball'), 'a maxed weapon is never offered');
});

test('upgrade limits: maxed stats leave the pool and the cards say when a pick reaches the limit', () => {
  const s = make('santa');
  s.stats.dmg = s.stats.base.dmg * 1.6;     // only damage is maxed
  const ctx = () => ({ wave: 10, luck: 0, weapons: { snowball: 1 }, available: ['snowball'], stats: s.stats, cosmetics: s.cosmetics });
  for (let i = 0; i < 300; i++) assert.ok(!rollUpgrades(ctx()).some((c) => c.id === 'dmg'));
  s.stats.atk = 1.46;                         // a pick of +8% would pass 1.5
  assert.match(describeCard('stat', 'atk', 'common', ctx()).desc, /reaches the limit/);
  s.stats.atk = 1.0;
  assert.doesNotMatch(describeCard('stat', 'atk', 'common', ctx()).desc, /limit/);
});


test('partly maxed builds are topped up to three cards with finishing touches', () => {
  const s = make('santa');
  for (const u of STAT_UPGRADES) if (u.id !== 'luck' && u.id !== 'xp') for (let i = 0; i < 80; i++) applyUpgrade({ kind: 'stat', id: u.id, mult: 4 }, s.stats, s.weapons);
  for (const w of Object.keys(WEAPONS)) s.weapons[w] = MAX_WEAPON_LEVEL;
  const cards = rollUpgrades({ wave: 10, luck: 0, weapons: { ...s.weapons }, available: Object.keys(WEAPONS), stats: s.stats, cosmetics: new Set() });
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.filter((c) => c.kind === 'stat').map((c) => c.id).sort(), ['luck', 'xp']);
  assert.equal(cards.filter((c) => c.kind === 'finisher').length, 1);
});



test('upgrade limits leave the enemies exactly as they were', () => {
  const old = (w) => 1 + (w - 1) * 0.18 + Math.pow(w, 1.5) * 0.03;      // the curve from the balance update
  const s = make('santa');
  s.run.wave = 15;
  const e = s.spawnEnemy('snowman', 100, 100);
  assert.ok(Math.abs(e.maxHp - ENEMIES.snowman.hp * old(15)) < 1e-6);
  maxEverything(s);
  const e2 = s.spawnEnemy('snowman', 100, 100);
  assert.equal(e2.maxHp, e.maxHp, 'enemy health does not depend on your upgrades');
});

// ---------------- after the limit ----------------
test('after the limit: only the cocoa refill is left, and it is applied without a menu', () => {
  const s = make('santa');
  maxEverything(s);
  assert.deepEqual(FINISHERS.map((f) => f.id), ['cocoa']);
  for (let i = 0; i < 100; i++) {
    const cards = rollUpgrades({ wave: 30, luck: 0, weapons: { ...s.weapons }, available: Object.keys(WEAPONS), stats: s.stats });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].id, 'cocoa');
    assert.equal(cards[0].auto, true);
  }
  s.stats.hp = 20;
  const asked = []; const off = bus.on('levelup', (d) => asked.push(d));
  s.pendingLevels = 2;
  s.startLevelUp();
  off();
  assert.equal(s.paused, false, 'the game was never paused');
  assert.deepEqual(s.cards, []);
  assert.equal(s.pendingLevels, 0);
  assert.equal(asked.length, 0, 'no level-up menu');
  assert.ok(Math.abs(s.stats.hp - Math.min(s.stats.maxHp, 20 + s.stats.maxHp * 0.4)) < 1e-6, 'two refills of 20%');
});

// ---------------- cosmetic effects (coin shop) ----------------
test('cosmetics catalogue: three slots, priced, and the old upgrade-pool cosmetics are now shop items', () => {
  assert.deepEqual(COSMETIC_SLOTS, ['trail', 'aura', 'kill']);
  assert.ok(COSMETIC_LIST.length >= 12);
  for (const slot of COSMETIC_SLOTS) assert.ok(COSMETIC_LIST.filter((c) => c.slot === slot).length >= 3, slot);
  for (const c of COSMETIC_LIST) { assert.ok(c.price > 0 && c.price <= 1000, c.id); assert.ok(c.name && c.desc && c.icon); }
  for (const id of ['trail_snow', 'trail_stars', 'halo_holly', 'kill_confetti']) assert.ok(COSMETICS[id], `${id} (formerly an upgrade pick) is in the shop`);
  const picks = rollUpgrades({ wave: 10, luck: 0, weapons: {}, available: [], stats: null });
  assert.ok(picks.every((c) => !String(c.id).match(/trail|halo|confetti/)), 'no cosmetics among level-up cards');
});

test('cosmetic selections are validated per slot and by ownership', () => {
  const owned = new Set(['trail_snow', 'halo_holly']);
  assert.deepEqual(sanitizeCosmetics({ trail: 'trail_snow', aura: 'halo_holly', kill: 'kill_confetti' }, owned), { trail: 'trail_snow', aura: 'halo_holly' });
  assert.deepEqual(sanitizeCosmetics({ trail: 'halo_holly' }, owned), {}, 'wrong slot');
  assert.deepEqual(sanitizeCosmetics({ trail: 'nope', aura: 7 }, null), {});
  assert.deepEqual(sanitizeCosmetics(null), {});
  assert.deepEqual(sanitizeCosmetics({ kill: 'kill_snow' }), { kill: 'kill_snow' }, 'no owner set means trust (already validated)');
});

for (const c of COSMETIC_LIST) {
  test(`cosmetic ${c.id} renders in a run and changes no combat numbers`, () => {
    const s = make('santa', { cosmetics: { [c.slot]: c.id } });
    assert.equal(s.fx[c.slot], c.id);
    s.keys.right.isDown = true;
    drive(s, 8);
    assert.ok(s.run.kills > 0);
    if (c.slot === 'aura') assert.ok(s.auraParts || s.auraRing, 'aura objects were created');
    const plain = make('santa'); plain.stats.crit = 0; s.stats.crit = 0;
    const hit = (sc) => { const e = sc.spawnEnemy('snowman', sc.player.x + 100, sc.player.y); sc.lastCrit = false; const b = sc.spawnSnowball(sc.player.x, sc.player.y, 0, 8, {}); sc.onBulletHit(b, e); return e.maxHp - e.hp; };
    assert.equal(hit(s), hit(plain));
  });
}

test('all three slots can be equipped at once', () => {
  const s = make('knight', { skin: 'knight_arctic', cosmetics: { trail: 'trail_aurora', aura: 'aura_aurora', kill: 'kill_candy' } });
  s.keys.up.isDown = true;
  drive(s, 10);
  assert.ok(s.auraParts.length === 12);
});

// ---------------- hidden Arctic wolf spider skin ----------------
test('Arctic wolf spider skin: hidden until owned, not buyable, has its own art', () => {
  const sp = SKINS.knight_arctic;
  assert.equal(sp.character, 'knight'); assert.equal(sp.name, 'Arctic Wolf Spider'); assert.equal(sp.hidden, true); assert.equal(sp.source, 'secret');
  assert.equal(isSkinVisible(sp, false), false, 'not shown in the collection when not owned');
  assert.equal(isSkinVisible(sp, true), true);
  for (const other of Object.values(SKINS)) if (other.id !== sp.id) assert.equal(isSkinVisible(other, false), true, `${other.id} stays visible`);
  assert.equal(skinRows('knight', 'knight_arctic'), SKIN_ART.knight_arctic.rows);
  assert.notEqual(skinRows('knight', 'knight_classic'), SKIN_ART.knight_arctic.rows);
  assert.equal(skinRows('knight', null), SPRITES.knight.rows);
  const R = SKIN_ART.knight_arctic.rows;
  assert.equal(R.length, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    assert.equal(R[y].length, 12);
    if (R[y][x] === '.') continue;
    assert.ok(SKIN_ART.knight_arctic.pal[R[y][x]], `palette for ${R[y][x]}`);
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && R[y + dy]?.[x + dx] && R[y + dy][x + dx] !== '.') n++;
    assert.ok(n > 0, `spider: floating pixel at ${x},${y}`);
  }
});

test('the spider skin works in a run', () => {
  const s = make('knight', { skin: 'knight_arctic' });
  drive(s, 10);
  assert.ok(s.run.kills > 0);
});

test('renamed: Candy Cane Elf', () => {
  assert.equal(SKINS.elf_candy.name, 'Candy Cane Elf');
  assert.equal(ADVENT_REWARDS[2].name, 'Candy Cane Elf');
  for (const f of ['src/data/catalog.js', 'src/data/advent.js', 'README.md']) assert.ok(!fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').includes('Candy Striper'), f);
});

test('the title screen has the splash text next to the logo', () => {
  const home = fs.readFileSync(new URL('../src/pages/HomePage.jsx', import.meta.url), 'utf8');
  assert.ok(home.includes('Play tester version'));
  assert.ok(home.indexOf('className="logo"') < home.indexOf('className="splash"'));
});

test('demo backend: buying and equipping effects, and the secret skin', async () => {
  await demo.resetAll();
  await demo.signUp({ username: 'FxTester' });
  await assert.rejects(() => demo.buy('cosmetic', 'trail_snow'), /Not enough coins/);
  clock.set('2026-12-12T09:00:00Z');
  for (let d = 1; d <= 12; d++) await demo.claimDay(d);            // 1350 coins
  clock.set(null);
  let me = await demo.getMe();
  assert.equal(me.profile.coins, 1350);
  await assert.rejects(() => demo.equipCosmetic('trail', 'trail_snow'), /not unlocked/);
  await demo.buy('cosmetic', 'trail_snow'); await demo.buy('cosmetic', 'halo_holly'); await demo.buy('cosmetic', 'kill_confetti');
  await assert.rejects(() => demo.buy('cosmetic', 'trail_snow'), /already own/);
  me = await demo.getMe();
  assert.equal(me.profile.coins, 1350 - 300 - 400 - 350);
  await assert.rejects(() => demo.equipCosmetic('aura', 'trail_snow'), /slot/);
  await assert.rejects(() => demo.equipCosmetic('sideways', 'trail_snow'), /slot/);
  await demo.equipCosmetic('trail', 'trail_snow'); await demo.equipCosmetic('aura', 'halo_holly'); await demo.equipCosmetic('kill', 'kill_confetti');
  assert.deepEqual((await demo.startRun('santa')).cosmetics, { trail: 'trail_snow', aura: 'halo_holly', kill: 'kill_confetti' });
  await demo.equipCosmetic('aura', null);
  assert.deepEqual((await demo.startRun('santa')).cosmetics, { trail: 'trail_snow', kill: 'kill_confetti' });
  // the secret skin cannot be bought or equipped until it is granted
  await assert.rejects(() => demo.buy('skin', 'knight_arctic'), /cannot be bought/);
  await assert.rejects(() => demo.select({ character: 'knight', skin: 'knight_arctic' }), /not unlocked/);
  assert.ok(!me.inventory.some((i) => i.item_id === 'knight_arctic'));
  await demo.grantOwner();
  me = await demo.getMe();
  assert.ok(me.inventory.some((i) => i.item_id === 'knight_arctic'));
  await demo.select({ character: 'knight', skin: 'knight_arctic' });
  assert.equal((await demo.getMe()).profile.equipped.knight, 'knight_arctic');
  await demo.resetAll();
});
