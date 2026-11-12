// Shared helpers for Netlify Functions. Secrets are read from server-side env vars only.
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const cleanUrl = (v) => (v ? v.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '') : v);

export function admin() {
  const url = cleanUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server is missing Supabase credentials');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Netlify's Node 20 runtime has no global WebSocket; supabase-js's realtime module demands one even though
    // functions never use realtime. Supplying `ws` fixes the "websocket library is missing" crash.
    realtime: { transport: ws }
  });
}

async function requireUser(req, sb) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

/** Wraps a POST-only, authenticated JSON function. */
export function handler(fn) {
  return async (req) => {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    try {
      const sb = admin();
      const user = await requireUser(req, sb);
      if (!user) return json(401, { error: 'Please sign in' });
      let body;
      try {
        const text = await req.text();
        if (text.length > 10_000) return json(413, { error: 'Request too large' });
        body = JSON.parse(text || '{}');
      } catch { return json(400, { error: 'Bad request' }); }
      return await fn({ sb, user, body });
    } catch (e) {
      console.error(e);
      return json(500, { error: 'Server error' });
    }
  };
}
