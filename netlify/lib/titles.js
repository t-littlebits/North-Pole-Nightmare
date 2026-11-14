// Awards any newly earned titles. Called after runs, advent claims and purchases.
// Also grants the mod attached to every earned title (this backfills older accounts).
// Failures here must never break the main action, so everything is best-effort.
// Returns { titles: [new title ids], mods: [new mod ids] }.
import { evaluateTitles, TITLE_BY_ID } from '../../src/data/titles.js';
import { ownedMods, giveMods } from './mods.js';

export async function awardTitles(sb, userId) {
  try {
    const [p, claims, inv, have] = await Promise.all([
      sb.from('profiles').select('games_played,total_kills,best_wave,bosses_defeated,best_score,presents_opened,total_seconds,equipped_title').eq('id', userId).single(),
      sb.from('advent_claims').select('day', { count: 'exact', head: true }).eq('user_id', userId),
      sb.from('inventory').select('item_type').eq('user_id', userId),
      sb.from('user_titles').select('title_id').eq('user_id', userId)
    ]);
    if (p.error) return { titles: [], mods: [] };
    const items = inv.data || [];
    const stats = {
      ...p.data, advent_claims: claims.count || 0,
      heroes_owned: items.filter((i) => i.item_type === 'character').length,
      skins_owned: items.filter((i) => i.item_type === 'skin').length
    };
    const owned = new Set((have.data || []).map((t) => t.title_id));
    const fresh = evaluateTitles(stats).filter((id) => !owned.has(id));
    if (fresh.length) {
      await sb.from('user_titles').upsert(fresh.map((id) => ({ user_id: userId, title_id: id, source: 'achievement' })), { onConflict: 'user_id,title_id', ignoreDuplicates: true });
      if (!p.data.equipped_title) {
        await sb.from('profiles').update({ equipped_title: fresh[0] }).eq('id', userId);
        await sb.from('leaderboard').update({ title: fresh[0] }).eq('user_id', userId);
      }
    }
    const haveMods = await ownedMods(sb, userId);
    const rewardMods = [...new Set([...owned, ...fresh])].map((t) => TITLE_BY_ID[t]?.mod).filter((m) => m && !haveMods.has(m));
    await giveMods(sb, userId, rewardMods, 'title');
    return { titles: fresh, mods: rewardMods };
  } catch (e) {
    console.error('awardTitles failed', e);
    return { titles: [], mods: [] };
  }
}
