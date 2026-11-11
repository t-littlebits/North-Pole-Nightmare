import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../lib/AppContext.jsx';
import { backend } from '../lib/backend/index.js';
import { formatTime } from '../lib/hooks.js';
import { CHARACTERS, defaultSkinFor } from '../data/catalog.js';
import { Hero } from '../components/Sprite.jsx';

export default function ProfilePage() {
  const { username } = useParams();
  const { user, profile: mine, claims, inventory, ready, setAuthOpen, showToast } = useApp();
  const name = username || user?.username;
  const [data, setData] = useState(undefined);

  useEffect(() => {
    if (!name) { setData(undefined); return undefined; }
    let alive = true;
    setData(undefined);
    backend.getPlayer(name).then((d) => alive && setData(d)).catch(() => alive && setData(null));
    return () => { alive = false; };
  }, [name, mine?.best_score, mine?.games_played]);

  if (!ready) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!name) return (
    <div className="page narrow"><div className="panel"><h1>Your profile</h1><p>Sign in to see your stats, coins and collection.</p><button className="btn" onClick={() => setAuthOpen(true)}>Sign in</button></div></div>
  );
  if (data === undefined) return <div className="page"><p className="muted">Looking for {name}…</p></div>;
  if (data === null) return <div className="page narrow"><div className="panel"><h1>Player not found</h1><p>No one called "{name}" has joined yet.</p><Link to="/players" className="btn">Search players</Link></div></div>;

  const p = data.profile;
  const own = user && p.username.toLowerCase() === user.username.toLowerCase();
  const ch = p.selected_character || 'santa';
  const skin = p.equipped?.[ch] || defaultSkinFor(ch);
  const share = async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/profile/${p.username}`); showToast('Profile link copied', 'ok'); } catch { showToast('Could not copy link', 'err'); } };

  return (
    <div className="page">
      <div className="panel profile-head">
        <Hero character={CHARACTERS[ch] ? ch : 'santa'} skin={skin} px={10} className="bob" />
        <div>
          <h1>{p.username}</h1>
          <p className="muted">{data.rank ? `All-time rank #${data.rank}` : 'Not ranked yet'} · joined {new Date(p.created_at).toLocaleDateString()}</p>
          <button className="btn small ghost" onClick={share}>Copy profile link</button>
        </div>
      </div>
      <div className="grid stats">
        <Box label="Best score" v={p.best_score.toLocaleString()} /><Box label="Best wave" v={p.best_wave} />
        <Box label="Runs played" v={p.games_played} /><Box label="Total kills" v={p.total_kills.toLocaleString()} />
        <Box label="Time survived" v={formatTime(p.total_seconds)} /><Box label="Bosses beaten" v={p.bosses_defeated} />
        <Box label="Presents opened" v={p.presents_opened} /><Box label="Lifetime score" v={Number(p.total_score).toLocaleString()} />
        {own && <><Box label="Coins" v={`🪙 ${mine?.coins ?? 0}`} /><Box label="Advent doors claimed" v={`${claims.length}/24`} /><Box label="Items owned" v={inventory.length} /></>}
      </div>
      <div className="panel">
        <h2>Recent runs</h2>
        {data.recent.length === 0 ? <p className="muted">No runs yet.</p> : (
          <div className="table-wrap"><table className="lb"><thead><tr><th>When</th><th>Hero</th><th className="num">Score</th><th className="num">Wave</th><th className="num">Kills</th></tr></thead>
            <tbody>{data.recent.map((r, i) => <tr key={i}><td>{new Date(r.created_at).toLocaleDateString()}</td><td>{CHARACTERS[r.character]?.name || r.character}</td><td className="num">{r.score.toLocaleString()}</td><td className="num">{r.wave}</td><td className="num">{r.kills}</td></tr>)}</tbody></table></div>
        )}
      </div>
    </div>
  );
}
const Box = ({ label, v }) => <div className="stat-box"><b>{v}</b><span>{label}</span></div>;
