// Runs player actions (buy, equip...) so the page feels instant even when the server takes a few seconds.
//  - `key`:        marks the action as pending, so its button can show a spinner and block double clicks
//  - `optimistic`: a function that updates the page immediately; if the server then says no, the real state is reloaded
// Several actions can overlap; only the last one to finish reloads, so a stale reload never undoes a newer click.
export function createRunner({ refresh, setMe, setPending, showToast }) {
  let inflight = 0;
  return async function act(fn, okMsg, opts = {}) {
    const { key, optimistic } = opts;
    if (key) setPending((p) => ({ ...p, [key]: true }));
    if (optimistic) setMe((m) => (m ? optimistic(m) : m));
    inflight += 1;
    let failed = false;
    try {
      const result = await fn();
      if (okMsg) showToast(okMsg, 'ok');
      return result;
    } catch (e) {
      failed = true;
      showToast((e && e.message) || 'Something went wrong', 'err');
      return null;
    } finally {
      inflight -= 1;
      if (key) setPending((p) => { const n = { ...p }; delete n[key]; return n; });
      if (inflight === 0 || failed) await refresh();
    }
  };
}
