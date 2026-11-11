import { useEffect, useState } from 'react';
import { backend } from './backend/index.js';

/** Leaderboard rows that refresh themselves when anyone sets a new best (Supabase Realtime). */
export function useLeaderboard(limit = 50) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => backend.getLeaderboard(limit)
      .then((r) => { if (alive) { setRows(r); setError(null); setPulse((p) => p + 1); } })
      .catch((e) => alive && setError(e.message));
    load();
    const off = backend.subscribeLeaderboard(load);
    return () => { alive = false; off(); };
  }, [limit]);
  return { rows, error, pulse };
}

/** Seconds-resolution ticking clock. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(sec)}s` : `${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
}
export const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
