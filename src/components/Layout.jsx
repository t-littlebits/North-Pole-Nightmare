import { NavLink, Link, Outlet } from 'react-router-dom';
import { useApp } from '../lib/AppContext.jsx';
import { backend } from '../lib/backend/index.js';
import Snow from './Snow.jsx';
import AuthModal from './AuthModal.jsx';

const LINKS = [['/', 'Home'], ['/play', 'Play'], ['/advent', 'Advent'], ['/leaderboard', 'Ranks'], ['/collection', 'Collection'], ['/players', 'Players'], ['/settings', 'Settings']];

export default function Layout() {
  const { user, profile, isDemo, setAuthOpen, toast, ready } = useApp();
  return (
    <div className="shell">
      <Snow />
      <header className="topbar">
        <Link to="/" className="brand" aria-label="North Pole Nightmare home">
          <span className="brand-a">NORTH POLE</span><span className="brand-b">NIGHTMARE</span>
        </Link>
        <nav aria-label="Main">
          {LINKS.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>{label}</NavLink>)}
        </nav>
        <div className="account">
          {user ? (
            <>
              <span className="coins" title="Coins">🪙 {profile?.coins ?? 0}</span>
              <Link to="/profile" className="btn small">{user.username}</Link>
              <button className="btn small ghost" onClick={() => backend.signOut()}>Sign out</button>
            </>
          ) : <button className="btn small" onClick={() => setAuthOpen(true)} disabled={!ready}>Sign in</button>}
        </div>
      </header>
      {isDemo && <div className="demo-banner">Demo mode: no Supabase keys found, so progress and scores are saved in this browser only.</div>}
      <main><Outlet /></main>
      <footer className="foot">Made with pixels, peppermint and questionable reindeer decisions.</footer>
      <AuthModal />
      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.msg}</div>}
    </div>
  );
}
