// Demo mode can preview the advent calendar on any date. Online mode always uses the real clock
// (and the server has the final say on what can be claimed).
let override = null;
export const clock = {
  now: () => (override ? new Date(override) : new Date()),
  set: (iso) => { override = iso || null; },
  get: () => override
};
