// Calls Supabase database functions straight from the browser (fast: one hop to the database).
// If the functions have not been installed yet (update-6-fast-actions.sql + catalog.sql), the caller's `fallback`
// (the slower Netlify function route) is used instead, so deploying the code before the SQL never breaks anything.
export const FRIENDLY = {
  not_signed_in: 'Please sign in',
  not_enough_coins: 'Not enough coins',
  already_owned: 'You already own this',
  not_for_sale: 'This item cannot be bought',
  character_locked: 'Character not unlocked',
  skin_locked: 'Skin not unlocked',
  cosmetic_locked: 'You have not unlocked that effect',
  bad_slot: 'That effect does not fit this slot',
  weapon_locked: 'You have not unlocked that weapon',
  too_many_slots: 'A weapon has 3 mod slots',
  mod_does_not_fit: 'That mod does not fit this weapon',
  mod_locked: 'You have not unlocked that mod',
  title_locked: 'Title not unlocked',
  no_boost: 'You have none of this boost',
  crate_empty: 'There are no more mods the crate can give you'
};

export const isMissingFunction = (error) =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message || '') || error.message === 'catalog_missing');

export function createRpc(client) {
  return async function rpc(name, args, fallback) {
    const { data, error } = await client.rpc(name, args);
    if (!error) return data;
    if (isMissingFunction(error) && fallback) return fallback();
    throw new Error(FRIENDLY[error.message] || 'Something went wrong. Please try again.');
  };
}
