import { handler, json } from '../lib/server.js';
import { BOOSTS, CHARACTERS, SKINS, WEAPONS } from '../../src/data/catalog.js';
import { TITLE_BY_ID } from '../../src/data/titles.js';
import { awardTitles } from '../lib/titles.js';

const owns = async (sb, uid, type, id) => {
  const { data } = await sb.from('inventory').select('item_id').eq('user_id', uid).eq('item_type', type).eq('item_id', id).maybeSingle();
  return !!data;
};

// Actions: buy | select | boost. Prices come from the catalog, never from the client.
export default handler(async ({ sb, user, body }) => {
  const { action } = body;
  if (action === 'buy') {
    const { type, id } = body;
    let price = 0;
    if (type === 'character' && CHARACTERS[id]) price = CHARACTERS[id].price;
    else if (type === 'weapon' && WEAPONS[id]) price = WEAPONS[id].price;
    else if (type === 'skin' && SKINS[id] && SKINS[id].source === 'shop') price = SKINS[id].price;
    if (!price) return json(400, { error: 'This item cannot be bought' });
    const { error } = await sb.rpc('buy_item', { p_user: user.id, p_type: type, p_id: id, p_price: price });
    if (error) {
      const m = error.message;
      return json(400, { error: m.includes('not_enough_coins') ? 'Not enough coins' : m.includes('already_owned') ? 'You already own this' : 'Purchase failed' });
    }
    return json(200, { ok: true, newTitles: await awardTitles(sb, user.id) });
  }

  if (action === 'select') {
    const { character, skin } = body;
    if (!CHARACTERS[character] || !(await owns(sb, user.id, 'character', character))) return json(403, { error: 'Character not unlocked' });
    const { data: prof } = await sb.from('profiles').select('equipped').eq('id', user.id).single();
    const equipped = { ...(prof?.equipped || {}) };
    if (skin) {
      if (!SKINS[skin] || SKINS[skin].character !== character || !(await owns(sb, user.id, 'skin', skin))) return json(403, { error: 'Skin not unlocked' });
      equipped[character] = skin;
    }
    const { error } = await sb.from('profiles').update({ selected_character: character, equipped }).eq('id', user.id);
    return error ? json(500, { error: 'Could not save' }) : json(200, { ok: true });
  }

  if (action === 'boost') {
    const id = body.id || null;
    if (id) {
      if (!BOOSTS[id]) return json(400, { error: 'Unknown boost' });
      const { data: prof } = await sb.from('profiles').select('boosts').eq('id', user.id).single();
      if (!((prof?.boosts || {})[id] > 0)) return json(400, { error: 'You have none of this boost' });
    }
    const { error } = await sb.from('profiles').update({ active_boost: id }).eq('id', user.id);
    return error ? json(500, { error: 'Could not save' }) : json(200, { ok: true });
  }
  if (action === 'title') {
    const id = body.id || null;
    if (id) {
      if (!TITLE_BY_ID[id]) return json(400, { error: 'Unknown title' });
      const { data } = await sb.from('user_titles').select('title_id').eq('user_id', user.id).eq('title_id', id).maybeSingle();
      if (!data) return json(403, { error: 'Title not unlocked' });
    }
    const { error } = await sb.from('profiles').update({ equipped_title: id }).eq('id', user.id);
    if (error) return json(500, { error: 'Could not save' });
    await sb.from('leaderboard').update({ title: id }).eq('user_id', user.id);
    return json(200, { ok: true });
  }
  return json(400, { error: 'Unknown action' });
});
