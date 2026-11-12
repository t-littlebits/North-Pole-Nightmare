import { useApp } from '../lib/AppContext.jsx';
import { backend } from '../lib/backend/index.js';
import { sfx } from '../game/audio.js';

export default function SettingsPage() {
  const { settings, setSetting, user, setAuthOpen, isDemo, showToast, act } = useApp();
  const Toggle = ({ k, label, hint }) => (
    <label className="toggle"><input type="checkbox" checked={!!settings[k]} onChange={(e) => setSetting({ [k]: e.target.checked })} /><span><b>{label}</b>{hint && <small>{hint}</small>}</span></label>
  );
  return (
    <div className="page narrow">
      <h1>Settings</h1>
      <div className="panel">
        <h2>Sound</h2>
        {Toggle({ k: 'sfx', label: 'Sound effects' })}
        {Toggle({ k: 'music', label: 'Music', hint: 'A quiet jingle while you play.' })}
        <label className="slider">Volume {Math.round(settings.volume * 100)}%
          <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => setSetting({ volume: Number(e.target.value) })} onPointerUp={() => sfx('level')} />
        </label>
      </div>
      <div className="panel">
        <h2>Display and controls</h2>
        {Toggle({ k: 'snow', label: 'Snowfall', hint: 'On the website and in the arena. Turn off for a calmer screen.' })}
        {Toggle({ k: 'shake', label: 'Screen shake' })}
        <label className="slider">Touch controls
          <select value={settings.touch} onChange={(e) => setSetting({ touch: e.target.value })}>
            <option value="auto">Automatic (show on touch screens)</option><option value="on">Always show</option><option value="off">Never show</option>
          </select>
        </label>
      </div>
      <div className="panel">
        <h2>Account</h2>
        {user ? (
          <><p>Signed in as <b>{user.username}</b>. Settings sync to your account.</p><button className="btn ghost" onClick={() => backend.signOut()}>Sign out</button></>
        ) : <><p>You are playing as a guest.</p><button className="btn" onClick={() => setAuthOpen(true)}>Sign in or create an account</button></>}
        {isDemo && (
          <div className="danger">
            <p className="muted">Demo mode keeps everything in this browser.</p>
            {user && <button className="btn ghost" onClick={() => act(() => backend.grantOwner(), 'Owner title granted (demo only)')}>Grant myself the Owner title</button>}
            <button className="btn ghost" onClick={async () => { if (window.confirm('Delete all demo players and progress on this device?')) { await backend.resetAll(); showToast('Demo data cleared', 'ok'); } }}>Reset demo data</button>
          </div>
        )}
      </div>
    </div>
  );
}
