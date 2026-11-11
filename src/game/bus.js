// Tiny event bus between React (HUD, menus) and the Phaser scene.
const listeners = new Map();
export const bus = {
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => listeners.get(name)?.delete(fn);
  },
  emit(name, data) { listeners.get(name)?.forEach((fn) => fn(data)); },
  clear() { listeners.clear(); }
};
