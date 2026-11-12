// Minimal fake of the Phaser surface that GameScene touches, enough to run the game loop headlessly.
const chain = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : t[k] ?? ((...a) => chain())),
  apply: () => chain()
});

class Sprite {
  constructor(group, x, y, key) {
    Object.assign(this, { x, y, key, active: true, scale: 1, rotation: 0, flipX: false, alpha: 1, texture: { key }, group });
    this.body = { setSize() {}, velocity: { x: 0, y: 0 } };
  }
  setVelocity(x, y) { this.body.velocity = { x, y }; return this; }
  destroy() { this.active = false; if (this.group) this.group.items = this.group.items.filter((i) => i !== this); }
}
for (const m of ['setDepth', 'setScale', 'setTint', 'setTintFill', 'clearTint', 'setFlipX', 'setAngle', 'setAlpha', 'setCollideWorldBounds', 'setOrigin', 'setVisible', 'setPosition', 'setScrollFactor', 'setStrokeStyle', 'setBlendMode']) {
  Sprite.prototype[m] = function () { return this; };
}
class Group {
  constructor() { this.items = []; }
  create(x, y, key) { const s = new Sprite(this, x, y, key); this.items.push(s); return s; }
  getChildren() { return this.items; }
  getLength() { return this.items.length; }
}

const key = () => ({ isDown: false });
export const events = { handlers: {} };
export const sceneStub = {
  textures: { exists: () => true, createCanvas: () => ({ getContext: () => chain(), refresh() {} }) },
  add: { tileSprite: () => chain(), image: (x, y, k) => new Sprite(null, x, y, k), circle: () => chain(), rectangle: () => chain(), triangle: () => chain(), text: () => chain(), ellipse: () => chain(), particles: () => chain() },
  physics: {
    world: { setBounds() {}, pause() {}, resume() {} },
    add: { group: () => new Group(), sprite: (x, y, k) => new Sprite(null, x, y, k), overlap: () => {} }
  },
  tweens: { add: (cfg) => { try { cfg?.onComplete?.(); } catch (e) { throw e; } return chain(); }, pauseAll() {}, resumeAll() {}, killTweensOf() {} },
  time: { delayedCall: (ms, fn) => { events.delayed = fn; } },
  cameras: { main: chain() },
  input: { keyboard: { addKeys: () => ({ up: key(), left: key(), down: key(), right: key(), space: key(), p: key(), esc: key() }), createCursorKeys: () => ({ up: key(), left: key(), down: key(), right: key() }) }, addPointer() {}, on() {} },
  sys: { game: { device: { input: { touch: false } } } },
  game: { registry: { get: () => globalThis.__runConfig } },
  events: { once() {} }
};

class Scene {
  constructor() {
    Object.assign(this, sceneStub);
    this.events = { once() {} };
    this.__ov = [];
    this.physics = { world: sceneStub.physics.world, add: { group: () => new Group(), sprite: (x, y, k) => new Sprite(null, x, y, k), overlap: (a, b, cb, pc, ctx) => { this.__ov.push({ a, b, cb, ctx }); } } };
  }
  // The mock has no physics engine: tests call this to fire overlap callbacks for things that are close together.
  runOverlaps() {
    for (const o of this.__ov) {
      const A = o.a.items ? o.a.items.slice() : [o.a], B = o.b.items ? o.b.items.slice() : [o.b];
      for (const x of A) for (const y of B) if (x.active && y.active && Math.hypot(x.x - y.x, x.y - y.y) < 22) o.cb.call(o.ctx, x, y);
    }
  }
}

const Phaser = {
  Scene,
  Math: {
    Between: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    Clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) }
  },
  Utils: { Array: { GetRandom: (a) => a[Math.floor(Math.random() * a.length)] } },
  Input: { Keyboard: { JustDown: () => false } },
  AUTO: 0, Scale: { FIT: 1, CENTER_BOTH: 1 }
};
export default Phaser;
