// Rules shared by the game, the demo backend AND the Netlify Functions.
// Anything here is what the server uses to judge a submitted run.
import { WAVE_SECONDS, MAX_POINTS_PER_KILL } from '../data/catalog.js';
import { ADVENT_BY_DAY } from '../data/advent.js';

// ---- Spawn model (the game uses these exact functions) ----
export const ENEMY_CAP = 160;
export const spawnInterval = (wave) => Math.max(260, 1100 - wave * 55); // ms
export const spawnCount = (wave) => 1 + Math.floor(wave / 4);

/** Theoretical maximum number of enemies that can have spawned in `seconds` of play. */
export function maxSpawns(seconds) {
  let total = 0;
  for (let w = 1; ; w++) {
    const start = (w - 1) * WAVE_SECONDS;
    if (start >= seconds) break;
    const dur = Math.min(WAVE_SECONDS, seconds - start);
    total += ((dur * 1000) / spawnInterval(w)) * spawnCount(w) + (w % 5 === 0 ? 1 : 0);
  }
  return Math.ceil(total * 1.5) + 30; // slack for elites / rounding
}

// ---- Scoring ----
export const computeScore = ({ killPoints, bosses, wave, seconds, presents }) =>
  killPoints + bosses * 500 + (wave - 1) * 100 + Math.floor(seconds) * 2 + presents * 25;

export const coinsForRun = ({ score, wave, bosses }) => Math.floor(score / 150) + wave * 5 + bosses * 25;

const int = (v) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : NaN);

/**
 * Validate a client-reported run against what is physically possible.
 * `serverElapsedSec` is measured by the server from the moment the run was started.
 * Returns { ok, error?, run? } where run holds sanitised numbers + the SERVER-computed score.
 */
export function validateRun(input, serverElapsedSec) {
  const r = {
    killPoints: int(input.killPoints), kills: int(input.kills), bosses: int(input.bosses),
    wave: int(input.wave), seconds: int(input.seconds), presents: int(input.presents)
  };
  for (const [k, v] of Object.entries(r)) if (!Number.isInteger(v) || v < 0 || v > 5_000_000) return { ok: false, error: `Invalid ${k}` };
  if (r.wave < 1) return { ok: false, error: 'Invalid wave' };
  if (r.seconds > 3 * 3600) return { ok: false, error: 'Run too long' };
  if (r.seconds > serverElapsedSec + 5) return { ok: false, error: 'Run time exceeds elapsed time' };
  if (r.wave > Math.floor(r.seconds / WAVE_SECONDS) + 1) return { ok: false, error: 'Wave too high for run time' };
  if (r.bosses > Math.floor(r.wave / 5)) return { ok: false, error: 'Too many bosses' };
  if (r.presents > Math.floor(r.seconds / 20) + r.bosses * 3 + Math.floor(r.kills * 0.05) + 2) return { ok: false, error: 'Too many presents' };
  if (r.kills > maxSpawns(r.seconds) + r.presents * 10) return { ok: false, error: 'More kills than enemies spawned' };
  if (r.killPoints > r.kills * MAX_POINTS_PER_KILL) return { ok: false, error: 'Kill points out of range' };
  const score = computeScore(r);
  return { ok: true, run: { ...r, score, coins: coinsForRun({ score, wave: r.wave, bosses: r.bosses }) } };
}

// ---- Advent calendar (all dates in UTC; matches GMT in December) ----
export const adventYear = (now = new Date()) => now.getUTCFullYear();
export const dayUnlockTime = (year, day) => Date.UTC(year, 11, day, 0, 0, 0);
export const isDayUnlocked = (year, day, now = new Date()) => day >= 1 && day <= 24 && now.getTime() >= dayUnlockTime(year, day);

/** The next door to open ({day, at}) or null once all 24 are open. */
export function nextUnlock(year, now = new Date()) {
  for (let d = 1; d <= 24; d++) if (now.getTime() < dayUnlockTime(year, d)) return { day: d, at: dayUnlockTime(year, d) };
  return null;
}

/** Validate a claim request. `claimedDays` is an array of day numbers already claimed this year. */
export function checkClaim(year, day, claimedDays, now = new Date()) {
  if (!Number.isInteger(day) || !ADVENT_BY_DAY[day]) return { ok: false, error: 'Unknown day' };
  if (year !== adventYear(now)) return { ok: false, error: 'This calendar is closed' };
  if (!isDayUnlocked(year, day, now)) return { ok: false, error: 'This door has not opened yet' };
  if (claimedDays.includes(day)) return { ok: false, error: 'Already claimed' };
  return { ok: true, reward: ADVENT_BY_DAY[day] };
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
