import { Link } from 'react-router-dom';
import { useLeaderboard } from '../lib/hooks.js';
import { useApp } from '../lib/AppContext.jsx';
import LeaderboardTable from '../components/LeaderboardTable.jsx';

export default function LeaderboardPage() {
  const { rows, error, pulse } = useLeaderboard(100);
  const { user, profile, isDemo } = useApp();
  const mine = rows && user ? rows.findIndex((r) => r.user_id === user.id) : -1;
  return (
    <div className="page">
      <h1>All-time leaderboard <span className="live" key={pulse}>● live</span></h1>
      <p className="muted">{isDemo ? 'Demo mode: your scores are compared with practice rivals on this device.' : 'Updates the moment anyone sets a new best.'} Each player shows their single best run.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel">
        <LeaderboardTable rows={rows} meId={user?.id} />
      </div>
      {user && (
        <div className="panel">
          {mine >= 0 ? <p>You are ranked <b>#{mine + 1}</b> with {rows[mine].score.toLocaleString()} points.</p>
            : profile?.best_score > 0 ? <p>Your best is {profile.best_score.toLocaleString()}. Climb into the top 100 to appear here.</p>
              : <p>You have no score yet. <Link to="/play" className="link">Play a run</Link> to join the board.</p>}
        </div>
      )}
    </div>
  );
}
