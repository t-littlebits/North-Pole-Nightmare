import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/AppContext.jsx';
import { backend } from '../lib/backend/index.js';
import { formatTime } from '../lib/hooks.js';
import { createGame } from '../game/createGame.js';
import { bus } from '../game/bus.js';
import { startMusic, stopMusic, sfx } from '../game/audio.js';
import { CHARACTERS, CHARACTER_IDS, SKINS, WEAPONS, BOOSTS, RARITIES } from '../data/catalog.js';
import { Hero, WeaponIcon } from '../components/Sprite.jsx';
import TitleTag from '../components/TitleTag.jsx';
import { ARENAS, ARENA_IDS, arenaUnlocked } from '../data/arenas.js';
import { TITLE_BY_ID } from '../data/titles.js';

const SWATCH = { village: '#e6f2fb', lake: '#b9e0f3', candy: '#fde9f1', workshop: '#4a3220' };

export default function GamePage() {
  const app = useApp();
  const { user, profile, owns, skinFor, showToast, refresh, ready, setAuthOpen } = app;
  const [phase, setPhase] = useState('menu');
  const [character, setCharacter] = useState('santa');
  const [skin, setSkin] = useState(null);
  const [arena, setArena] = useState('village');
  const [cfg, setCfg] = useState(null);
  const [result, setResult] = useState(null);
  const [starting, setStarting] = useState(false);
  const initialised = useRef(false);

  useEffect(() => {
    if (ready && !initialised.current && profile) {
      initialised.current = true;
      if (owns('character', profile.selected_character)) setCharacter(profile.selected_character);
      try { const a = localStorage.getItem('npn.arena'); if (a && arenaUnlocked(a, profile.best_wave)) setArena(a); } catch { /* ignore */ }
    }
  }, [ready, profile, owns]);
  useEffect(() => () => stopMusic(), []);

  const chosenSkin = skin && SKINS[skin]?.character === character && owns('skin', skin) ? skin : skinFor(character);
  const mySkins = Object.values(SKINS).filter((s) => s.character === character && owns('skin', s.id));
  const boosts = Object.entries(profile?.boosts || {}).filter(([, n]) => n > 0);

  async function start() {
    setStarting(true);
    try {
      let runId = null, used = null;
      if (user) {
        backend.select({ character, skin: chosenSkin }).catch(() => {});
        const r = await backend.startRun(character, arena);
        runId = r.runId; used = r.boost;
        refresh();
      }
      setCfg({ character, arena: user ? arena : 'village', skin: chosenSkin, boost: used, unlockedWeapons: Object.keys(WEAPONS).filter((w) => owns('weapon', w)), runId });
      setPhase('playing');
      startMusic();
    } catch (e) { showToast(e.message, 'err'); }
    setStarting(false);
  }

  async function pickBoost(id) {
    if (!user) return;
    try { await backend.setBoost(profile.active_boost === id ? null : id); await refresh(); } catch (e) { showToast(e.message, 'err'); }
  }

  if (phase === 'playing') return <Playing cfg={cfg} onOver={(r) => { stopMusic(); setResult(r); setPhase('over'); }} onQuit={() => { stopMusic(); setPhase('menu'); refresh(); }} />;
  if (phase === 'over') return <Over result={result} cfg={cfg} onAgain={() => { setPhase('menu'); }} />;

  return (
    <div className="page">
      <h1>Choose your hero</h1>
      <div className="grid heroes">
        {CHARACTER_IDS.map((id) => {
          const c = CHARACTERS[id];
          const locked = !owns('character', id);
          return (
            <button key={id} className={`panel hero-card ${character === id ? 'sel' : ''} ${locked ? 'locked' : ''}`} onClick={() => { if (locked) { showToast(`${c.name} is locked. Unlock in the Collection (${c.price} coins).`, 'info'); return; } setCharacter(id); setSkin(null); sfx('click'); }} aria-pressed={character === id}>
              <Hero character={id} skin={skinFor(id)} px={7} className="bob" />
              <strong>{c.name}</strong>
              <span className="stat">HP {c.hp} · Speed {c.speed}</span>
              <span className="muted small-text">{locked ? `Locked · ${c.price} coins` : c.ability.name}</span>
            </button>
          );
        })}
      </div>

      <h2 className="section-title">Choose your arena</h2>
      <div className="grid arenas">
        {ARENA_IDS.map((id) => {
          const a = ARENAS[id];
          const open = arenaUnlocked(id, user ? profile?.best_wave : 0);
          return (
            <button key={id} className={`panel arena-card ${arena === id ? 'sel' : ''} ${open ? '' : 'locked'}`} style={{ borderTopColor: SWATCH[id] }}
              aria-pressed={arena === id}
              onClick={() => { if (!open) { showToast(user ? `Reach wave ${a.unlockWave} in any run to unlock ${a.name}.` : `Sign in and reach wave ${a.unlockWave} to unlock ${a.name}.`, 'info'); return; } setArena(id); try { localStorage.setItem('npn.arena', id); } catch { /* ignore */ } sfx('click'); }}>
              <strong>{a.name}</strong>
              <span className="small-text">{a.blurb}</span>
              <span className="small-text gold">{a.mechanic}</span>
              {!open && <span className="muted small-text">🔒 Reach wave {a.unlockWave} (your best: {user ? profile?.best_wave || 0 : 0})</span>}
            </button>
          );
        })}
      </div>

      <div className="panel">
        <h2>{CHARACTERS[character].ability.name}</h2>
        <p>{CHARACTERS[character].ability.desc} <span className="muted">Cooldown {CHARACTERS[character].ability.cd}s. Press Space (or the GO button on touch).</span></p>
        <p className="muted">Starts with <b>{WEAPONS[CHARACTERS[character].weapon].name}</b>. {CHARACTERS[character].blurb}</p>
        {mySkins.length > 1 && (
          <div className="chips" aria-label="Skins">
            {mySkins.map((s) => <button key={s.id} className={`chip ${chosenSkin === s.id ? 'on' : ''}`} style={{ borderColor: RARITIES[s.rarity].color }} onClick={() => setSkin(s.id)}>{s.name}</button>)}
          </div>
        )}
        {boosts.length > 0 && (
          <div className="chips" aria-label="Boosts">
            <span className="muted">Boost for this run:</span>
            {boosts.map(([id, n]) => <button key={id} className={`chip ${profile.active_boost === id ? 'on' : ''}`} onClick={() => pickBoost(id)} title={BOOSTS[id]?.desc}>{BOOSTS[id]?.icon} {BOOSTS[id]?.name} ×{n}</button>)}
          </div>
        )}
      </div>

      <div className="row center">
        <button className="btn big" onClick={start} disabled={starting}>{starting ? 'Loading…' : 'Start run'}</button>
        {!user && <button className="btn ghost" onClick={() => setAuthOpen(true)}>Sign in to save scores</button>}
      </div>
      {!user && <p className="muted center-text">Playing as a guest: free heroes only, and your score will not be saved to the leaderboard.</p>}
      <div className="panel controls">
        <h3>Controls</h3>
        <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to move · <kbd>Space</kbd> special · <kbd>P</kbd> pause · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick upgrades. Attacks are automatic. On touch screens, drag on the left side to move and tap GO for your special.</p>
      </div>
    </div>
  );
}

function Playing({ cfg, onOver, onQuit }) {
  const { settings, setSetting } = useApp();
  const hostRef = useRef(null);
  const frameRef = useRef(null);
  const overRef = useRef(onOver);
  overRef.current = onOver;
  const [hud, setHud] = useState(null);
  const [levelup, setLevelup] = useState(null);
  const [paused, setPaused] = useState(false);
  const [boss, setBoss] = useState(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    let game = null, dead = false, bannerTimer = 0;
    const offs = [
      bus.on('hud', setHud), bus.on('levelup', setLevelup), bus.on('paused', setPaused), bus.on('boss', setBoss),
      bus.on('wave', (w) => { setBanner(w); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => setBanner(null), 2200); }),
      bus.on('bossphase', () => { setBanner({ text: 'PHASE 2!', boss: true }); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => setBanner(null), 2200); }),
      bus.on('gameover', (r) => overRef.current(r))
    ];
    const boot = () => { if (!dead && hostRef.current) game = createGame(hostRef.current, cfg); };
    (document.fonts?.load ? document.fonts.load('10px "Press Start 2P"') : Promise.resolve()).catch(() => {}).then(boot);
    const vis = () => { if (document.hidden) bus.emit('ui:pause'); };
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; clearTimeout(bannerTimer); offs.forEach((o) => o()); document.removeEventListener('visibilitychange', vis); game?.destroy(true); };
  }, [cfg]);

  useEffect(() => {
    if (!levelup) return undefined;
    const onKey = (e) => { const i = ['1', '2', '3'].indexOf(e.key); if (i >= 0 && levelup.cards[i]) bus.emit('ui:pick', i); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [levelup]);

  const fullscreen = () => { const el = frameRef.current; if (document.fullscreenElement) document.exitFullscreen(); else el?.requestFullscreen?.().catch(() => {}); };
  const sp = hud?.special;
  const ready = sp && sp.cd <= 0;

  return (
    <div className="page game-page">
      <div className="game-frame" ref={frameRef}>
        <div className="game-host" ref={hostRef} />
        {!hud && <div className="loading-cover">Hanging the lights…</div>}
        {hud && (
          <div className="hud" aria-live="off">
            <div className="hud-top">
              <div className="bars">
                <div className="bar hp"><i style={{ width: `${Math.max(0, (hud.hp / hud.maxHp) * 100)}%` }} /><span>{hud.hp}/{hud.maxHp}{hud.shield > 0 ? ` +${hud.shield}` : ''}</span></div>
                <div className="bar xp"><i style={{ width: `${Math.min(100, (hud.xp / hud.xpNext) * 100)}%` }} /><span>LV {hud.level}</span></div>
              </div>
              <div className="readout">
                <b>{hud.score.toLocaleString()}</b>
                <span>Wave {hud.wave} · {hud.waveLeft}s</span>
                <span>{hud.kills} kills · {formatTime(hud.time)}</span>
              </div>
              <div className="hud-buttons">
                <button className="btn tiny" onClick={() => setSetting({ sfx: !settings.sfx, music: !settings.music })} aria-label="Toggle sound">{settings.sfx ? '🔊' : '🔇'}</button>
                <button className="btn tiny" onClick={fullscreen} aria-label="Fullscreen">⛶</button>
                <button className="btn tiny" onClick={() => bus.emit('ui:pause')} aria-label="Pause">⏸</button>
              </div>
            </div>
            {boss && <div className="bossbar"><span>{boss.name}{boss.phase === 2 && <em className="phase2"> · ENRAGED</em>}</span><div className={`bar boss ${boss.phase === 2 ? 'enraged' : ''}`}><i style={{ width: `${(boss.hp / boss.max) * 100}%` }} /></div></div>}
            {banner && <div className={`banner ${banner.boss ? 'boss' : ''}`}>{banner.text || (banner.boss ? `BOSS WAVE ${banner.wave}` : `WAVE ${banner.wave}`)}</div>}
            <div className="hud-bottom">
              <div className="weapons">{Object.entries(hud.weapons).map(([id, l]) => <span key={id} className="wslot" title={WEAPONS[id].name}><WeaponIcon id={id} px={3} /><em>{l}</em>{(hud.mods?.[id] || 0) > 0 && <b className="modpip">{'★'.repeat(hud.mods[id])}</b>}</span>)}{hud.rage && <span className="rage">RAGE</span>}</div>
              <button className={`special ${ready ? 'ready' : ''}`} onClick={() => bus.emit('ui:special')} disabled={!ready}>
                <span>{sp.name}</span><small>{ready ? 'SPACE' : `${(sp.cd / 1000).toFixed(1)}s`}</small>
                {!ready && <i style={{ width: `${100 - (sp.cd / sp.max) * 100}%` }} />}
              </button>
            </div>
          </div>
        )}
        {levelup && (
          <div className="overlay">
            <h2>Level up! Choose a gift</h2>
            <div className="cards">
              {levelup.cards.map((c, i) => (
                <button key={`${c.id}${i}`} className={`card r-${c.rarity} ${c.kind === 'mod' ? 'mod' : ''}`} onClick={() => bus.emit('ui:pick', i)}>
                  <small>{c.kind === 'mod' ? `★ ${c.tag}` : RARITIES[c.rarity].name}</small>
                  <div className="card-icon">{c.iconWeapon ? <WeaponIcon id={c.iconWeapon} px={5} /> : <span>{c.icon}</span>}</div>
                  <strong>{c.name}</strong>
                  <p>{c.desc}</p>
                  <kbd>{i + 1}</kbd>
                </button>
              ))}
            </div>
          </div>
        )}
        {paused && !levelup && (
          <div className="overlay">
            <h2>Paused</h2>
            <div className="row center">
              <button className="btn" onClick={() => bus.emit('ui:resume')}>Resume</button>
              <button className="btn ghost" onClick={onQuit}>Quit run</button>
            </div>
          </div>
        )}
      </div>
      <p className="muted center-text rotate-hint">Tip: turn your phone sideways for a bigger arena.</p>
    </div>
  );
}

function Over({ result, cfg, onAgain }) {
  const { refresh, user } = useApp();
  const [sub, setSub] = useState({ state: cfg.runId ? 'saving' : 'guest' });
  const sent = useRef(false);
  const [guestBest, setGuestBest] = useState(0);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (cfg.runId) {
      backend.submitRun(cfg.runId, result.stats)
        .then((r) => { setSub({ state: 'saved', ...r }); refresh(); })
        .catch((e) => setSub({ state: 'error', msg: e.message }));
    } else {
      try {
        const prev = Number(localStorage.getItem('npn.guestBest') || 0);
        setGuestBest(Math.max(prev, result.score));
        if (result.score > prev) localStorage.setItem('npn.guestBest', String(result.score));
      } catch { /* ignore */ }
    }
  }, [cfg, result, refresh]);

  const s = result.stats;
  const score = sub.state === 'saved' ? sub.score : result.score;
  return (
    <div className="page narrow">
      <div className="panel over">
        <h1>Game over</h1>
        {sub.state === 'saved' && sub.isBest && <p className="best">★ New personal best! ★</p>}
        <div className="bigscore">{score.toLocaleString()}</div>
        <div className="grid stats">
          <Stat label="Wave" v={s.wave} /><Stat label="Kills" v={s.kills} /><Stat label="Time" v={formatTime(s.seconds)} />
          <Stat label="Bosses" v={s.bosses} /><Stat label="Presents" v={s.presents} /><Stat label="Level" v={result.level} />
        </div>
        {sub.state === 'saving' && <p className="muted">Sending your run to the North Pole…</p>}
        {sub.state === 'saved' && (
          <>
            <p>Personal best before this run: <b>{(sub.prevBest || 0).toLocaleString()}</b>{sub.rank ? <> · All-time rank <b>#{sub.rank}</b></> : null}</p>
            <p className="gold">+{sub.coins} coins earned 🪙</p>
            {sub.newTitles?.length > 0 && <p>New title{sub.newTitles.length > 1 ? 's' : ''} unlocked: {sub.newTitles.map((id) => <TitleTag key={id} id={id} />)}</p>}
          </>
        )}
        {sub.state === 'error' && <p className="error">Could not save this run: {sub.msg}</p>}
        {sub.state === 'guest' && <p className="muted">Guest run. Best on this device: {guestBest.toLocaleString()}. {!user && 'Sign in to save scores and earn coins.'}</p>}
        <div className="row center">
          <button className="btn big" onClick={onAgain}>Play again</button>
          <Link className="btn ghost" to="/leaderboard">Leaderboard</Link>
          <Link className="btn ghost" to="/collection">Spend coins</Link>
        </div>
      </div>
    </div>
  );
}
const Stat = ({ label, v }) => <div className="stat-box"><b>{v}</b><span>{label}</span></div>;
