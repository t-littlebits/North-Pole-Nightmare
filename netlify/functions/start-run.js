import { handler, json } from '../lib/server.js';
import { BOOSTS, CHARACTERS } from '../../src/data/catalog.js';
import { ARENAS, arenaUnlocked } from '../../src/data/arenas.js';

// Creates a server-side run ticket. The server clock starts here, and the
// selected boost (if any) is consumed atomically.
export default handler(async ({ sb, user, body }) => {
  const character = String(body.character || '');
  if (!CHARACTERS[character]) return json(400, { error: 'Unknown character' });
  const arena = ARENAS[body.arena] ? body.arena : 'village';
  const { data: prof } = await sb.from('profiles').select('active_boost,best_wave').eq('id', user.id).single();
  if (!arenaUnlocked(arena, prof?.best_wave)) return json(403, { error: 'That arena is still locked' });
  const boost = prof?.active_boost && BOOSTS[prof.active_boost] ? prof.active_boost : null;
  const { data, error } = await sb.rpc('start_run', { p_user: user.id, p_character: character, p_boost: boost });
  if (error) return json(error.message.includes('character_locked') ? 403 : 500, { error: error.message.includes('character_locked') ? 'Character not unlocked' : 'Could not start run' });
  return json(200, { runId: data.run_id, boost: data.boost });
});
