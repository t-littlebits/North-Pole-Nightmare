import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backend, isDemo } from './backend/index.js';
import { getSettings, saveSettings, subscribeSettings } from './settings.js';
import { DEFAULT_WEAPONS, defaultSkinFor, CHARACTER_IDS } from '../data/catalog.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const FREE = new Set([
  'character:santa', 'character:elf',
  ...DEFAULT_WEAPONS.map((w) => `weapon:${w}`),
  ...CHARACTER_IDS.map((c) => `skin:${defaultSkinFor(c)}`)
]);

export function AppProvider({ children }) {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(getSettings());
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    try { setMe(await backend.getMe()); } catch { setMe(null); }
  }, []);

  useEffect(() => {
    let off;
    (async () => {
      await backend.init();
      await refresh();
      setReady(true);
      off = backend.onAuthChange(refresh);
    })();
    return () => off && off();
  }, [refresh]);
  useEffect(() => subscribeSettings(setSettings), []);

  const owned = useMemo(() => new Set((me?.inventory || []).map((i) => `${i.item_type}:${i.item_id}`)), [me]);
  const owns = useCallback((type, id) => FREE.has(`${type}:${id}`) || owned.has(`${type}:${id}`), [owned]);
  const skinFor = useCallback((character) => {
    const s = me?.profile?.equipped?.[character];
    return s && owned.has(`skin:${s}`) ? s : defaultSkinFor(character);
  }, [me, owned]);

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 2800 ? null : t)), 3000);
  }, []);

  /** Runs a backend action, refreshes the profile and reports errors as a toast. */
  const act = useCallback(async (fn, okMsg) => {
    try {
      const r = await fn();
      await refresh();
      if (okMsg) showToast(okMsg, 'ok');
      return r;
    } catch (e) {
      showToast(e.message || 'Something went wrong', 'err');
      return null;
    }
  }, [refresh, showToast]);

  const setSetting = useCallback((patch) => {
    const next = saveSettings(patch);
    backend.saveSettings(next).catch(() => {});
  }, []);

  const value = {
    ready, isDemo, user: me?.user || null, profile: me?.profile || null, inventory: me?.inventory || [], claims: me?.claims || [],
    titles: me?.titles || [], refresh, owns, skinFor, settings, setSetting, authOpen, setAuthOpen, toast, showToast, act
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
