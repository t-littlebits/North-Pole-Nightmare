import { useState } from 'react';
import { backend, isDemo } from '../lib/backend/index.js';
import { useApp } from '../lib/AppContext.jsx';

export default function AuthModal() {
  const { authOpen, setAuthOpen, refresh, showToast } = useApp();
  const [mode, setMode] = useState('signin');
  const [f, setF] = useState({ username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  if (!authOpen) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(''); setNote('');
    try {
      if (mode === 'signup') {
        const r = await backend.signUp(f);
        if (r?.needsConfirm) { setNote('Check your email and click the confirmation link, then sign in.'); setMode('signin'); setBusy(false); return; }
      } else await backend.signIn(f);
      await refresh();
      showToast('Welcome to the North Pole!', 'ok');
      setAuthOpen(false);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  return (
    <div className="modal-back" onClick={() => setAuthOpen(false)} role="presentation">
      <form className="panel modal auth" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label="Account">
        <h2>{mode === 'signup' ? 'Join the Nice List' : 'Welcome back'}</h2>
        {isDemo && <p className="muted">Demo mode: accounts live only in this browser, so no password is needed.</p>}
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Create account</button>
        </div>
        {(mode === 'signup' || isDemo) && (
          <label>Username<input value={f.username} onChange={set('username')} maxLength={16} autoComplete="username" required placeholder="3-16 letters, numbers, _" /></label>
        )}
        {!isDemo && (
          <>
            <label>Email<input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></label>
            <label>Password<input type="password" value={f.password} onChange={set('password')} minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required /></label>
          </>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        {note && <p className="ok">{note}</p>}
        <div className="row">
          <button className="btn" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          <button type="button" className="btn ghost" onClick={() => setAuthOpen(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
