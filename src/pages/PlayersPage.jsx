import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '../lib/backend/index.js';
import { CHARACTERS, defaultSkinFor } from '../data/catalog.js';
import { Hero } from '../components/Sprite.jsx';
import TitleTag from '../components/TitleTag.jsx';

export default function PlayersPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      backend.searchPlayers(q).then((r) => { if (alive) { setRows(r); setErr(''); } }).catch((e) => alive && setErr(e.message));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  return (
    <div className="page narrow">
      <h1>Find a player</h1>
      <input className="search" type="search" placeholder="Search by username…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={16} aria-label="Search players" autoFocus />
      {err && <p className="error">{err}</p>}
      <p className="muted">{q.trim() ? 'Matching players' : 'Top players by best score'}</p>
      <div className="list">
        {rows?.map((p) => {
          const ch = CHARACTERS[p.selected_character] ? p.selected_character : 'santa';
          return (
            <Link key={p.id} to={`/profile/${p.username}`} className="panel player-row">
              <Hero character={ch} skin={p.equipped?.[ch] || defaultSkinFor(ch)} px={4} />
              <strong>{p.username}</strong>
              <TitleTag id={p.equipped_title} />
              <span className="muted">Best {p.best_score.toLocaleString()} · wave {p.best_wave}</span>
            </Link>
          );
        })}
        {rows && rows.length === 0 && <p className="muted">No one found called "{q}". Check the spelling?</p>}
        {!rows && <p className="muted">Searching…</p>}
      </div>
    </div>
  );
}
