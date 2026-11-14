import { handler, json } from '../lib/server.js';
import { BOOSTS, CHARACTERS } from '../../src/data/catalog.js';
import { sanitizeLoadout } from '../../src/data/mods.js';

// Creates a server-side run ticket. The server clock starts here, and the
// selected boost (if any) is consumed atomically.
export default handler(async ({ sb, user, body }) => {
  const character = String(body.character || '');
  if (!CHARACTERS[character]) return json(400, { error: 'Unknown character' });
  const { data: prof } = await sb.from('profiles').select('active_boost,loadout').eq('id', user.id).single();
  const boost = prof?.active_boost && BOOSTS[prof.active_boost] ? prof.active_boost : null;
  const { data, error } = await sb.rpc('start_run', { p_user: user.id, p_character: character, p_boost: boost });
  if (error) return json(error.message.includes('character_locked') ? 403 : 500, { error: error.message.includes('character_locked') ? 'Character not unlocked' : 'Could not start run' });
  // The loadout is read from the database and filtered by what the player really owns, never taken from the client.
  const { data: inv } = await sb.from('inventory').select('item_type,item_id').eq('user_id', user.id).in('item_type', ['mod', 'weapon']);
  const mods = new Set((inv || []).filter((i) => i.item_type === 'mod').map((i) => i.item_id));
  const weapons = new Set((inv || []).filter((i) => i.item_type === 'weapon').map((i) => i.item_id));
  return json(200, { runId: data.run_id, boost: data.boost, loadout: sanitizeLoadout(prof?.loadout, mods, weapons) });
});
