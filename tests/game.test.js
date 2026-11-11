import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Redirect the 'phaser' import to our mock before loading the scene.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec === 'phaser') return { url: new URL('./tests/mocks/phaser.js', 'file://${process.cwd()}/').href, shortCircuit: true };
  return next(spec, ctx);
}`));

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.window = globalThis;
globalThis.performance ??= { now: () => Date.now() };

const { default: GameScene } = await import('../src/game/scenes/GameScene.js');
const { bus } = await import('../src/game/bus.js');
const { validateRun } = await import('../src/shared/rules.js');

function runScene(character, boost, seconds, { godMode = true } = {}) {
  globalThis.__runConfig = { character, skin: `${character}_classic`, boost, unlockedWeapons: ['snowball', 'candycane', 'iceblast', 'bells', 'bomb'], runId: 'x' };
  const s = new GameScene();
  s.init();
  s.create();
  const events = [];
  const offs = ['levelup', 'wave', 'boss', 'gameover'].map((n) => bus.on(n, (d) => events.push([n, d])));
  let t = 0;
  for (let i = 0; i < seconds * 60 && !s.ended; i++) {
    t += 16;
    if (godMode) s.stats.hp = s.stats.maxHp;
    // act as the player: pick a card whenever offered, trigger special periodically, place enemies close to the player
    const lvl = events.filter(([n, d]) => n === 'levelup' && d).length;
    if (s.cards.length) s.chooseUpgrade(0);
    if (i % 200 === 0) s.trySpecial();
    if (i % 90 === 0) s.player.x += 5;
    s.update(t, 16);
    // kill things near the player so XP/gems flow and weapons get exercised
    for (const e of s.enemies.getChildren().slice()) if (e.active && Math.hypot(e.x - s.player.x, e.y - s.player.y) < 500) { e.x = s.player.x + 30; e.y = s.player.y; }
  }
  offs.forEach((o) => o());
  return { s, events };
}

for (const ch of ['santa', 'elf', 'snowman', 'reindeer', 'knight']) {
  test(`scene runs headlessly for ${ch} (2 minutes of simulated play)`, () => {
    const { s, events } = runScene(ch, ch === 'santa' ? 'xp_boost' : null, 120);
    assert.ok(s.run.wave >= 4, `reached wave ${s.run.wave}`);
    assert.ok(s.run.kills > 0, 'killed something');
    assert.ok(events.some(([n]) => n === 'wave'));
    // the stats the client would submit must pass the server validator for a run this long
    const stats = { killPoints: s.run.killPoints, kills: s.run.kills, bosses: s.run.bosses, wave: s.run.wave, seconds: Math.floor(s.runMs / 1000), presents: s.run.presents };
    const v = validateRun(stats, Math.floor(s.runMs / 1000) + 2);
    assert.ok(v.ok, `server validator accepted the run: ${v.error}`);
  });
}

test('boss wave spawns a boss and death emits gameover', () => {
  const { s, events } = runScene('santa', null, 160);
  assert.ok(s.run.wave >= 5);
  assert.ok(events.some(([n, d]) => n === 'boss' && d), 'boss announced');
  // now let the player die
  s.ended = false; s.stats.hp = 1; s.invulnUntil = 0; s.hurt(999);
  assert.ok(s.ended);
});
