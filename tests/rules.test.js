import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun, checkClaim, maxSpawns, computeScore, nextUnlock } from '../src/shared/rules.js';
import { rollUpgrades, applyUpgrade } from '../src/data/upgrades.js';
import { ADVENT_REWARDS } from '../src/data/advent.js';
import { SKINS, CHARACTERS } from '../src/data/catalog.js';

const good = { killPoints: 1200, kills: 150, bosses: 1, wave: 6, seconds: 170, presents: 6 };

test('accepts a plausible run and computes the score server-side', () => {
  const v = validateRun({ ...good, score: 99999999 }, 175);
  assert.ok(v.ok);
  assert.equal(v.run.score, computeScore(good)); // the client-supplied score is ignored
});
test('rejects impossible runs', () => {
  assert.equal(validateRun(good, 100).ok, false);                       // more play time than the server saw
  assert.equal(validateRun({ ...good, wave: 40 }, 175).ok, false);      // wave too high for time
  assert.equal(validateRun({ ...good, kills: 90000 }, 175).ok, false);  // more kills than enemies spawned
  assert.equal(validateRun({ ...good, bosses: 3 }, 175).ok, false);     // too many bosses
  assert.equal(validateRun({ ...good, killPoints: -1 }, 175).ok, false);
  assert.equal(validateRun({ ...good, kills: 'abc' }, 175).ok, false);
});
test('maxSpawns grows with time', () => assert.ok(maxSpawns(600) > maxSpawns(60)));

test('advent: future doors are never claimable, past doors are', () => {
  const dec5 = new Date(Date.UTC(2026, 11, 5, 12));
  assert.equal(checkClaim(2026, 5, [], dec5).ok, true);
  assert.equal(checkClaim(2026, 1, [], dec5).ok, true);      // missed door
  assert.equal(checkClaim(2026, 6, [], dec5).ok, false);     // future door
  assert.equal(checkClaim(2026, 24, [], dec5).ok, false);
  assert.equal(checkClaim(2026, 5, [5], dec5).ok, false);    // already claimed
  assert.equal(checkClaim(2025, 1, [], dec5).ok, false);     // wrong year
  assert.equal(checkClaim(2026, 1, [], new Date(Date.UTC(2026, 10, 30, 23, 59))).ok, false); // before Dec 1
  assert.equal(checkClaim(2026, 24, [], new Date(Date.UTC(2026, 11, 24, 0, 0))).ok, true);
  assert.equal(nextUnlock(2026, new Date(Date.UTC(2026, 10, 10)))?.day, 1);
  assert.equal(nextUnlock(2026, new Date(Date.UTC(2026, 11, 30))), null);
});
test('advent data is complete and references real items', () => {
  assert.equal(ADVENT_REWARDS.length, 24);
  ADVENT_REWARDS.forEach((r, i) => assert.equal(r.day, i + 1));
  for (const g of ADVENT_REWARDS.flatMap((r) => r.grants)) {
    if (g.type === 'skin') assert.ok(SKINS[g.id], g.id);
    if (g.type === 'character') assert.ok(CHARACTERS[g.id], g.id);
  }
});
test('upgrades: three distinct cards, applied correctly', () => {
  const ctx = { wave: 10, luck: 0, weapons: { snowball: 1 }, available: ['snowball', 'candycane', 'iceblast'] };
  for (let i = 0; i < 200; i++) {
    const cards = rollUpgrades(ctx);
    assert.equal(cards.length, 3);
    assert.equal(new Set(cards.map((c) => c.kind + c.id)).size, 3);
  }
  const stats = { maxHp: 100, hp: 50, speed: 100, atk: 1, dmg: 1, pickup: 60, regen: 0, crit: 0, xpMult: 1, armor: 0, cdr: 0, proj: 0, luck: 0 };
  const w = { snowball: 1 };
  applyUpgrade({ kind: 'stat', id: 'maxhp', mult: 1 }, stats, w);
  assert.equal(stats.maxHp, 112);
  applyUpgrade({ kind: 'weapon', id: 'snowball', levels: 3 }, stats, w);
  assert.equal(w.snowball, 4);
});
