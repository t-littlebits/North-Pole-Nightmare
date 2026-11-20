/** A button that shows a spinner and blocks double clicks while its action is running. */
export default function ActionButton({ pending = false, pendingLabel = 'Working…', className = 'btn small', disabled = false, title, onClick, children }) {
  return (
    <button className={`${className} ${pending ? 'pending' : ''}`} disabled={disabled || pending} aria-busy={pending} title={title} onClick={onClick}>
      {pending ? <><span className="spin" aria-hidden="true" />{pendingLabel}</> : children}
    </button>
  );
}
