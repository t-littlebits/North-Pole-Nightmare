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
const { ARENAS, ARENA_IDS, arenaUnlocked } = await import('../src/data/arenas.js');
const { MODS, availableMods } = await import('../src/data/mods.js');
const { BOSSES, CHARACTERS } = await import('../src/data/catalog.js');
const { rollUpgrades, applyUpgrade } = await import('../src/data/upgrades.js');
const { TITLES, evaluateTitles, TITLE_BY_ID } = await import('../src/data/titles.js');
const { validateRun } = await import('../src/shared/rules.js');
const { demo } = await import('../src/lib/backend/demo.js');

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
  test(`arena ${id} runs and keeps its rules`, () => {
    const s = make('santa', { arena: id });
    assert.equal(s.arena.id, id);
    drive(s, 70);
    assert.ok(s.run.wave >= 2 && s.run.kills > 0);
    if (id === 'candy') assert.ok(s.zones.length > 5, 'sticky puddles exist');
    if (id === 'workshop') assert.ok(s.dark, 'darkness overlay');
    if (id === 'lake') assert.equal(s.arena.ice, true);
  });
}

test('arena unlocking by best wave', () => {
  assert.ok(arenaUnlocked('village', 0));
  assert.ok(!arenaUnlocked('lake', 4));
  assert.ok(arenaUnlocked('lake', 5));
  assert.ok(!arenaUnlocked('workshop', 11) && arenaUnlocked('workshop', 12));
  assert.ok(!arenaUnlocked('nope', 99));
});

test('workshop spawns ghosts from wave 1 and lake favours snowmen', () => {
  const w = make('santa', { arena: 'workshop' });
  const seen = new Set(); for (let i = 0; i < 400; i++) seen.add(w.pickType());
  assert.ok(seen.has('ghost'));
  const village = make('santa'); const v = new Set(); for (let i = 0; i < 400; i++) v.add(village.pickType());
  assert.ok(!v.has('ghost'));
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

// ---------------- weapon mods ----------------
test('mods: offered at level 3 and 6, chosen mods are removed from the pool', () => {
  assert.equal(availableMods('snowball', 2, []).length, 0);
  assert.equal(availableMods('snowball', 3, []).length, 3);
  assert.equal(availableMods('snowball', 5, ['heavy']).length, 0);
  assert.equal(availableMods('snowball', 6, ['heavy']).length, 2);
  assert.equal(availableMods('snowball', 8, ['heavy', 'split']).length, 0);
  const ctx = { wave: 5, luck: 0, weapons: { snowball: 3 }, mods: {}, available: ['snowball', 'candycane'] };
  let sawMod = false;
  for (let i = 0; i < 300; i++) {
    const cards = rollUpgrades(ctx);
    assert.equal(new Set(cards.map((c) => c.kind + c.id)).size, cards.length);
    if (cards.some((c) => c.kind === 'mod')) { sawMod = true; const c = cards.find((x) => x.kind === 'mod'); assert.equal(c.weapon, 'snowball'); assert.equal(c.rarity, 'epic'); }
  }
  assert.ok(sawMod);
  const mods = {};
  applyUpgrade({ kind: 'mod', weapon: 'snowball', modId: 'split' }, {}, {}, mods);
  assert.deepEqual(mods, { snowball: ['split'] });
});

for (const [w, list] of Object.entries(MODS)) {
  for (const m of list) {
    test(`mod ${w}:${m.id} runs in-game`, () => {
      const s = make('santa');
      s.weapons = { [w]: 6 };
      s.mods = { [w]: [m.id] };
      drive(s, 25);
      assert.ok(s.run.kills > 0, 'weapon killed things');
    });
  }
}

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
  await assert.rejects(() => demo.startRun('santa', 'lake'), /locked/);
  const { runId } = await demo.startRun('santa', 'village');
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
