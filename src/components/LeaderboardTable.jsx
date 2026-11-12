import { Link } from 'react-router-dom';
import { Hero } from './Sprite.jsx';
import { CHARACTERS } from '../data/catalog.js';
import TitleTag from './TitleTag.jsx';

const medal = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1);

export default function LeaderboardTable({ rows, meId, compact = false }) {
  if (!rows) return <p className="muted">Loading the Nice List…</p>;
  if (!rows.length) return <p className="muted">No scores yet. Be the first on the board!</p>;
  return (
    <div className="table-wrap">
      <table className="lb">
        <thead><tr><th>#</th><th>Player</th><th className="num">Score</th>{!compact && <><th className="num">Wave</th><th className="num">Kills</th></>}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.user_id} className={r.user_id === meId ? 'me' : ''}>
              <td className="rank">{medal(i)}</td>
              <td>
                <Link to={`/profile/${r.username}`} className="who">
                  {CHARACTERS[r.character] && <Hero character={r.character} px={2} title="" />}
                  <span>{r.username}</span>
                </Link>
                {r.title && <TitleTag id={r.title} />}
              </td>
              <td className="num">{r.score.toLocaleString()}</td>
              {!compact && <><td className="num">{r.wave}</td><td className="num">{r.kills.toLocaleString()}</td></>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
