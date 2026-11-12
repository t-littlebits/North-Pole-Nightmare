// Online backend: Supabase (auth, Postgres, Realtime) + Netlify Functions for everything that must be trusted.
import { createClient } from '@supabase/supabase-js';
import { adventYear } from '../../shared/rules.js';
import { USERNAME_RE } from '../../shared/rules.js';

const cleanUrl = (v) => (v ? v.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '') : v);
const url = cleanUrl(import.meta.env.VITE_SUPABASE_URL);
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasSupabase = Boolean(url && anon);
export const supabase = hasSupabase ? createClient(url, anon) : null;

const esc = (s) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

async function call(fn, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in');
  const res = await fetch(`/.netlify/functions/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

export const online = {
  mode: 'online',
  async init() { await supabase.auth.getSession(); },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange(() => cb());
    return () => data.subscription.unsubscribe();
  },
  async getSession() {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, username: u.user_metadata?.username || 'Player' } : null;
  },

  async signUp({ username, email, password }) {
    if (!USERNAME_RE.test(username || '')) throw new Error('Username must be 3-16 letters, numbers or underscores');
    const { data: free, error: e1 } = await supabase.rpc('username_available', { p_name: username });
    if (e1) throw new Error('Could not check that username');
    if (!free) throw new Error('That username is taken');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
    if (error) throw new Error(error.message);
    return { needsConfirm: !data.session };
  },
  async signIn({ email, password }) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  },
  async signOut() { await supabase.auth.signOut(); },

  async getMe() {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const year = adventYear(new Date());
    const [p, inv, cl, tt] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('inventory').select('item_type,item_id').eq('user_id', user.id),
      supabase.from('advent_claims').select('year,day').eq('user_id', user.id).eq('year', year),
      supabase.from('user_titles').select('title_id').eq('user_id', user.id)
    ]);
    if (p.error) return null;
    return { user: { id: user.id, username: p.data.username }, profile: p.data, inventory: inv.data || [], claims: cl.data || [], titles: (tt.data || []).map((t) => t.title_id) };
  },

  startRun: (character, arena = 'village') => call('start-run', { character, arena }),
  submitRun: (runId, stats) => call('submit-score', { runId, stats }),

  async getLeaderboard(limit = 50) {
    const { data, error } = await supabase.from('leaderboard').select('*').order('score', { ascending: false }).limit(limit);
    if (error) throw new Error('Could not load the leaderboard');
    return data;
  },
  subscribeLeaderboard(cb) {
    const ch = supabase.channel(`lb-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, () => cb())
      .subscribe();
    return () => supabase.removeChannel(ch);
  },

  claimDay: (day) => call('claim-reward', { day }),
  buy: (type, id) => call('inventory', { action: 'buy', type, id }),
  select: ({ character, skin }) => call('inventory', { action: 'select', character, skin }),
  setBoost: (id) => call('inventory', { action: 'boost', id }),
  equipTitle: (id) => call('inventory', { action: 'title', id }),

  async saveSettings(settings) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.from('profiles').update({ settings }).eq('id', data.session.user.id);
  },

  async searchPlayers(q) {
    let query = supabase.from('public_profiles').select('id,username,selected_character,equipped,equipped_title,games_played,best_score,best_wave').order('best_score', { ascending: false }).limit(20);
    const needle = (q || '').trim();
    if (needle) query = query.ilike('username', `%${esc(needle)}%`);
    const { data, error } = await query;
    if (error) throw new Error('Search failed');
    return data;
  },

  async getPlayer(username) {
    const { data: profile } = await supabase.from('public_profiles').select('*').ilike('username', esc(username || '')).maybeSingle();
    if (!profile) return null;
    const [recent, rank] = await Promise.all([
      supabase.from('scores').select('score,wave,kills,character,created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(8),
      profile.best_score > 0 ? supabase.from('leaderboard').select('user_id', { count: 'exact', head: true }).gt('score', profile.best_score) : Promise.resolve({ count: null })
    ]);
    return { profile, recent: recent.data || [], rank: rank.count == null ? null : rank.count + 1 };
  }
};
