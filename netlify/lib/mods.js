// Server-side mod helpers. Present drops are rolled HERE (from the validated present count), never by the client.
import { rollPresentMods } from '../../src/data/mods.js';

export async function ownedMods(sb, uid) {
  const { data } = await sb.from('inventory').select('item_id').eq('user_id', uid).eq('item_type', 'mod');
  return new Set((data || []).map((r) => r.item_id));
}

export async function giveMods(sb, uid, ids, source) {
  if (!ids.length) return;
  await sb.from('inventory').upsert(ids.map((id) => ({ user_id: uid, item_type: 'mod', item_id: id, source })), { onConflict: 'user_id,item_type,item_id', ignoreDuplicates: true });
}

export async function dropPresentMods(sb, uid, presents) {
  try {
    if (!presents) return [];
    const found = rollPresentMods(presents, await ownedMods(sb, uid));
    await giveMods(sb, uid, found, 'present');
    return found;
  } catch (e) {
    console.error('dropPresentMods failed', e);
    return [];
  }
}
