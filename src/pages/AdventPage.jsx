import { useState } from 'react';
import { useApp } from '../lib/AppContext.jsx';
import { backend } from '../lib/backend/index.js';
import { clock } from '../lib/clock.js';
import { useNow, formatDuration } from '../lib/hooks.js';
import { adventYear, isDayUnlocked, nextUnlock, dayUnlockTime } from '../shared/rules.js';
import { ADVENT_REWARDS } from '../data/advent.js';
import { RARITIES } from '../data/catalog.js';
import { sfx } from '../game/audio.js';
import { RewardIcon, grantLabel } from '../components/RewardIcon.jsx';

const PRESETS = [['', 'Real date'], ['2026-11-30T12:00:00Z', 'Nov 30'], ['2026-12-01T09:00:00Z', 'Dec 1'], ['2026-12-12T09:00:00Z', 'Dec 12'], ['2026-12-24T09:00:00Z', 'Dec 24']];

export default function AdventPage() {
  const { user, claims, act, setAuthOpen, isDemo, refresh, showToast } = useApp();
  useNow();
  const [modal, setModal] = useState(null);   // {reward, fresh}
  const [busyDay, setBusyDay] = useState(null);
  const [shake, setShake] = useState(null);

  const date = clock.now();
  const year = adventYear(date);
  const claimed = new Set(claims.filter((c) => c.year === year).map((c) => c.day));
  const next = nextUnlock(year, date);
  const todayDay = date.getUTCMonth() === 11 ? date.getUTCDate() : 0;
  const claimable = ADVENT_REWARDS.filter((r) => isDayUnlocked(year, r.day, date) && !claimed.has(r.day)).length;

  async function openDoor(r) {
    const unlocked = isDayUnlocked(year, r.day, date);
    if (claimed.has(r.day)) { setModal({ reward: r, fresh: false }); return; }
    if (!unlocked) {
      setShake(r.day); setTimeout(() => setShake(null), 500);
      showToast(`Door ${r.day} opens in ${formatDuration(dayUnlockTime(year, r.day) - date.getTime())}`, 'info');
      return;
    }
    if (!user) { setAuthOpen(true); return; }
    setBusyDay(r.day);
    const res = await act(() => backend.claimDay(r.day));
    setBusyDay(null);
    if (res) { sfx('claim'); setModal({ reward: res.reward || r, fresh: true }); }
  }

  return (
    <div className="page">
      <h1>Advent calendar {year}</h1>
      <div className="panel advent-head">
        <p className="countdown">{next ? <>Next door ({next.day}) opens in <b>{formatDuration(next.at - date.getTime())}</b></> : <>All 24 doors are open.</>}</p>
        <p className="muted">Doors open at midnight UTC from 1 to 24 December. {claimable > 0 ? `${claimable} present${claimable > 1 ? 's' : ''} waiting to be claimed.` : 'Nothing waiting right now.'} Missed doors can be claimed any time this year. Future doors stay shut.</p>
        {!user && <button className="btn small" onClick={() => setAuthOpen(true)}>Sign in to claim</button>}
        {isDemo && (
          <label className="demo-date">Demo date preview
            <select value={clock.get() || ''} onChange={(e) => { clock.set(e.target.value); refresh(); }}>
              {PRESETS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="doors">
        {ADVENT_REWARDS.map((r) => {
          const isClaimed = claimed.has(r.day);
          const open = isDayUnlocked(year, r.day, date);
          const state = isClaimed ? 'claimed' : open ? (r.day === todayDay ? 'today' : 'missed') : 'locked';
          return (
            <button key={r.day} className={`door ${state} ${shake === r.day ? 'shake' : ''} ${busyDay === r.day ? 'opening' : ''}`} onClick={() => openDoor(r)} aria-label={`Door ${r.day}, ${state}`}>
              <span className="front"><b>{r.day}</b><small>{state === 'today' ? 'TODAY' : state === 'missed' ? 'MISSED' : state === 'claimed' ? '' : '🔒'}</small></span>
              <span className="back" style={{ borderColor: RARITIES[r.rarity].color }}>{isClaimed ? <RewardIcon grant={r.grants[0]} px={4} /> : '🎁'}</span>
            </button>
          );
        })}
      </div>

      {modal && (
        <div className="modal-back" onClick={() => setModal(null)} role="presentation">
          <div className={`panel modal reveal ${modal.fresh ? 'fresh' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Reward">
            <small className="rar" style={{ color: RARITIES[modal.reward.rarity].color }}>{RARITIES[modal.reward.rarity].name} · Day {modal.reward.day}</small>
            <h2>{modal.reward.name}</h2>
            <div className="reward-icons">{modal.reward.grants.map((g, i) => <RewardIcon key={i} grant={g} px={9} />)}</div>
            <p>{modal.reward.grants.map(grantLabel).join(' + ')}</p>
            <p className="muted">{modal.fresh ? 'Added to your account.' : 'Already claimed.'}</p>
            <button className="btn" onClick={() => setModal(null)}>Nice!</button>
            {modal.fresh && <div className="confetti" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.07}s`, background: ['#e63946', '#ffcf4a', '#8fdcff', '#35c27a'][i % 4] }} />)}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
