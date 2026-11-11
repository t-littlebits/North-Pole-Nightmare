import { Link } from 'react-router-dom';
import { useLeaderboard, useNow, formatDuration } from '../lib/hooks.js';
import { useApp } from '../lib/AppContext.jsx';
import { clock } from '../lib/clock.js';
import { adventYear, nextUnlock } from '../shared/rules.js';
import { CHARACTER_IDS } from '../data/catalog.js';
import { Hero, Enemy } from '../components/Sprite.jsx';
import LeaderboardTable from '../components/LeaderboardTable.jsx';

export default function HomePage() {
  const { rows } = useLeaderboard(5);
  const { user, skinFor } = useApp();
  useNow();
  const d = clock.now();
  const next = nextUnlock(adventYear(d), d);

  return (
    <div className="page">
      <section className="hero">
        <h1 className="logo"><span>NORTH POLE</span><span>NIGHTMARE</span></h1>
        <p className="tag">The elves have gone feral. Hold the line, one wave at a time.</p>
        <div className="parade" aria-hidden="true">
          <div className="side">{CHARACTER_IDS.map((c, i) => <Hero key={c} character={c} skin={skinFor(c)} px={6} className="bob" />)}</div>
          <div className="side foes">{['e_ghost', 'e_reindeer', 'e_gingerbread', 'e_elf', 'e_snowman'].map((e) => <Enemy key={e} id={e} px={6} className="bob alt" />)}</div>
        </div>
        <div className="row center">
          <Link to="/play" className="btn big play">PLAY</Link>
          {!user && <Link to="/leaderboard" className="btn ghost">See the leaderboard</Link>}
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <h2>Top players <span className="live">● live</span></h2>
          <LeaderboardTable rows={rows} meId={user?.id} compact />
          <p><Link to="/leaderboard" className="link">Full leaderboard</Link></p>
        </section>
        <section className="panel">
          <h2>Advent calendar</h2>
          <p>{next ? <>Door {next.day} opens in <b className="gold">{formatDuration(next.at - d.getTime())}</b>.</> : 'Every door is open. Grab anything you missed!'}</p>
          <p className="muted">24 presents: skins, weapons, coins and boosts. Missed a day? Claim it later. Future doors stay shut.</p>
          <Link to="/advent" className="btn">Open the calendar</Link>
        </section>
      </div>

      <section className="panel">
        <h2>How to survive</h2>
        <ul className="plain">
          <li>Move with WASD or the arrow keys. Your weapons fire on their own.</li>
          <li>Collect green, blue and purple gems to level up and pick one of three upgrades.</li>
          <li>Grab mystery presents. Most are great. Some are on the naughty list.</li>
          <li>Every fifth wave brings a boss. Bring a plan, and bring Space.</li>
        </ul>
      </section>
    </div>
  );
}
