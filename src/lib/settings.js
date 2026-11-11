// Player settings, persisted locally (and mirrored to the account when online).
const KEY = 'npn.settings.v1';
export const DEFAULT_SETTINGS = { music: true, sfx: true, volume: 0.6, snow: true, shake: true, touch: 'auto', showFps: false };

let cache = null;
const subs = new Set();

export function getSettings() {
  if (cache) return cache;
  try { cache = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { cache = { ...DEFAULT_SETTINGS }; }
  return cache;
}
export function saveSettings(patch) {
  cache = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable */ }
  subs.forEach((fn) => fn(cache));
  return cache;
}
export const subscribeSettings = (fn) => { subs.add(fn); return () => subs.delete(fn); };
