import { useState } from 'react';
import { backend } from '../lib/backend/index.js';
import { useApp } from '../lib/AppContext.jsx';

const KINDS = [['suggestion', 'Suggestion'], ['bug', 'Bug report'], ['other', 'Something else']];

export default function FeedbackModal({ onClose }) {
  const { showToast, isDemo } = useApp();
  const [kind, setKind] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await backend.sendFeedback({ kind, message });
      showToast(isDemo ? 'Saved on this device (demo mode). Thank you!' : 'Thank you! Your feedback was sent.', 'ok');
      onClose();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <form className="panel modal feedback" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label="Send feedback">
        <h2>Feedback &amp; suggestions</h2>
        <p className="muted">Found a bug, or have an idea that would make the game better?</p>
        <div className="chips" role="radiogroup" aria-label="Type of feedback">
          {KINDS.map(([id, label]) => <button type="button" key={id} role="radio" aria-checked={kind === id} className={`chip ${kind === id ? 'on' : ''}`} onClick={() => setKind(id)}>{label}</button>)}
        </div>
        <label>Your message
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={6} required minLength={5} placeholder="What happened, or what would you like to see?" />
        </label>
        <p className="muted small-text">{message.length}/1000</p>
        {err && <p className="error" role="alert">{err}</p>}
        <div className="row">
          <button className="btn" disabled={busy || message.trim().length < 5}>{busy ? 'Sending…' : 'Send'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
