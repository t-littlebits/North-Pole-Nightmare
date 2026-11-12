import { handler, json } from '../lib/server.js';
import { validateRun } from '../../src/shared/rules.js';
import { awardTitles } from '../lib/titles.js';

// The client sends raw run stats. The SERVER computes the score and coins,
// checks the numbers against what is physically possible, and writes the result.
export default handler(async ({ sb, user, body }) => {
  const runId = String(body.runId || '');
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return json(400, { error: 'Bad run id' });

  const { data: run } = await sb.from('runs').select('*').eq('id', runId).eq('user_id', user.id).maybeSingle();
  if (!run || run.submitted) return json(400, { error: 'This run was already submitted or does not exist' });

  const elapsed = (Date.now() - new Date(run.started_at).getTime()) / 1000;
  const v = validateRun(body.stats || {}, elapsed);
  if (!v.ok) {
    await sb.from('runs').update({ submitted: true }).eq('id', runId); // burn the ticket
    return json(422, { error: `Run rejected: ${v.error}` });
  }
  const r = v.run;
  const { data, error } = await sb.rpc('apply_run', {
    p_run: runId, p_user: user.id, p_score: r.score, p_wave: r.wave, p_kills: r.kills, p_bosses: r.bosses,
    p_seconds: r.seconds, p_presents: r.presents, p_coins: r.coins, p_character: run.character
  });
  if (error) return json(400, { error: 'Could not save run' });
  const newTitles = await awardTitles(sb, user.id);
  return json(200, { newTitles, score: r.score, coins: r.coins, wave: r.wave, kills: r.kills, isBest: data.is_best, prevBest: data.prev_best, rank: data.rank });
});
