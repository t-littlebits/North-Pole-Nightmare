import { handler, json } from '../lib/server.js';
import { BOOSTS, CHARACTERS, SKINS, WEAPONS } from '../../src/data/catalog.js';
import { TITLE_BY_ID } from '../../src/data/titles.js';
import { awardTitles } from '../lib/titles.js';
import { ownedMods } from '../lib/mods.js';
import { MOD_CRATE_PRICE, MAX_SLOTS, canEquip, rollModDrop } from '../../src/data/mods.js';

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
    const t = await awardTitles(sb, user.id);
    return json(200, { ok: true, newTitles: t.titles, newMods: t.mods });
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
  if (action === 'loadout') {
    const weapon = String(body.weapon || '');
    const list = Array.isArray(body.mods) ? body.mods.map(String) : [];
    if (!WEAPONS[weapon] || !(await owns(sb, user.id, 'weapon', weapon))) return json(403, { error: 'You have not unlocked that weapon' });
    if (list.length > MAX_SLOTS || new Set(list).size !== list.length) return json(400, { error: `A weapon has ${MAX_SLOTS} mod slots` });
    const have = await ownedMods(sb, user.id);
    for (const id of list) {
      if (!canEquip(id, weapon)) return json(400, { error: 'That mod does not fit this weapon' });
      if (!have.has(id)) return json(403, { error: 'You have not unlocked that mod' });
    }
    const { data: prof } = await sb.from('profiles').select('loadout').eq('id', user.id).single();
    const loadout = { ...(prof?.loadout || {}) };
    if (list.length) loadout[weapon] = list; else delete loadout[weapon];
    const { error } = await sb.from('profiles').update({ loadout }).eq('id', user.id);
    return error ? json(500, { error: 'Could not save' }) : json(200, { ok: true });
  }

  if (action === 'crate') {
    // The server picks the mod and charges the coins atomically (buy_item refuses if you cannot afford it).
    const id = rollModDrop(await ownedMods(sb, user.id));
    if (!id) return json(400, { error: 'You already own every mod' });
    const { error } = await sb.rpc('buy_item', { p_user: user.id, p_type: 'mod', p_id: id, p_price: MOD_CRATE_PRICE });
    if (error) return json(400, { error: error.message.includes('not_enough_coins') ? 'Not enough coins' : 'Could not open the crate' });
    return json(200, { ok: true, mod: id });
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
