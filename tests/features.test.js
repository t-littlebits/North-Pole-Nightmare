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
const { WEAPONS, CHARACTER_IDS, ENEMIES, MAX_POINTS_PER_KILL } = await import('../src/data/catalog.js');
const { enemyHpScale, enemyDmgScale } = await import('../src/shared/rules.js');
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
  s.weapons = { bells: 8 };
  const e = s.spawnEnemy('snowman', s.player.x + 10, s.player.y);
  for (let i = 0; i < 120; i++) { s.t += 16; s.runMs += 16; s.updateBells(0.016); e.x = s.bells[0].x; e.y = s.bells[0].y; }
  assert.equal(s.bells.length, 4, 'four bells at level 8');
  assert.ok(!e.kUntil, 'no knockback from the bells themselves');
  assert.ok(e.hp < e.maxHp, 'but they still hurt');
  const chime = make('santa', { loadout: { bells: ['chime'] } });
  chime.weapons = { bells: 8 };
  const far = chime.spawnEnemy('snowman', chime.player.x + 60, chime.player.y);
  chime.runMs = 5000; chime.updateBells(0.016);
  assert.ok(far.kUntil > chime.runMs, 'the Chime Wave mod is now the only bell knockback');
});

test('balance: armor and regeneration are capped, level-up heal is small', () => {
  const stats = { maxHp: 100, hp: 100, speed: 100, atk: 1, dmg: 1, pickup: 60, regen: 0, crit: 0, xpMult: 1, armor: 0, cdr: 0, proj: 0, luck: 0 };
  for (let i = 0; i < 30; i++) { applyUpgrade({ kind: 'stat', id: 'armor', mult: 4 }, stats, {}); applyUpgrade({ kind: 'stat', id: 'regen', mult: 4 }, stats, {}); }
  assert.equal(stats.armor, 8); assert.equal(stats.regen, 5);
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
