import { handler, json } from '../lib/server.js';

const KINDS = ['bug', 'suggestion', 'other'];

// Players must be signed in (keeps spam down) and are limited to 5 messages an hour.
// Read feedback in Supabase: Table Editor -> feedback.
export default handler(async ({ sb, user, body }) => {
  const kind = KINDS.includes(body.kind) ? body.kind : 'other';
  const message = String(body.message || '').trim();
  if (message.length < 5) return json(400, { error: 'Please write a little more (at least 5 characters)' });
  if (message.length > 1000) return json(400, { error: 'Please keep it under 1000 characters' });

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since);
  if ((count || 0) >= 5) return json(429, { error: 'You have sent a lot of feedback this hour. Please try again later.' });

  const { data: prof } = await sb.from('profiles').select('username').eq('id', user.id).single();
  const { error } = await sb.from('feedback').insert({ user_id: user.id, username: prof?.username || null, kind, message, page: String(body.page || '').slice(0, 100) });
  if (error) return json(500, { error: 'Could not send feedback' });
  return json(200, { ok: true });
});
