import { handler, json } from '../lib/server.js';
import { adventYear, checkClaim } from '../../src/shared/rules.js';
import { awardTitles } from '../lib/titles.js';

// Door N can be claimed only if it is already open on the SERVER clock (UTC).
// Past doors stay claimable until the year ends; future doors never are.
export default handler(async ({ sb, user, body }) => {
  const now = new Date();
  const year = adventYear(now);
  const day = Number(body.day);
  const { data: claims } = await sb.from('advent_claims').select('day').eq('user_id', user.id).eq('year', year);
  const c = checkClaim(year, day, (claims || []).map((x) => x.day), now);
  if (!c.ok) return json(403, { error: c.error });
  const { error } = await sb.rpc('claim_advent', { p_user: user.id, p_year: year, p_day: day, p_reward: c.reward });
  if (error) return json(error.code === '23505' ? 409 : 500, { error: error.code === '23505' ? 'Already claimed' : 'Could not claim reward' });
  const newTitles = await awardTitles(sb, user.id);
  return json(200, { reward: c.reward, year, day, newTitles });
});
