import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRunner } from './actionRunner.js';
import { backend, isDemo } from './backend/index.js';
import { getSettings, saveSettings, subscribeSettings } from './settings.js';
import { DEFAULT_WEAPONS, defaultSkinFor, CHARACTER_IDS } from '../data/catalog.js';   // heroes and weapons are free for everyone

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const FREE = new Set([
  ...CHARACTER_IDS.map((c) => `character:${c}`),
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

  // Actions (buy, equip...) show instantly and reconcile with the server afterwards: see lib/actionRunner.js
  const [pending, setPending] = useState({});
  const runner = useRef(null);
  if (!runner.current) runner.current = createRunner({ refresh, setMe, setPending, showToast });
  const act = runner.current;
  const isPending = useCallback((key) => !!pending[key], [pending]);
  const busy = Object.keys(pending).length > 0;

  const setSetting = useCallback((patch) => {
    const next = saveSettings(patch);
    backend.saveSettings(next).catch(() => {});
  }, []);

  const value = {
    ready, isDemo, user: me?.user || null, profile: me?.profile || null, inventory: me?.inventory || [], claims: me?.claims || [],
    titles: me?.titles || [], refresh, owns, skinFor, settings, setSetting, authOpen, setAuthOpen, toast, showToast, act, isPending, busy
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
