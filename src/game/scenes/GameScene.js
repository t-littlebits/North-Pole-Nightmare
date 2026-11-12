import Phaser from 'phaser';
import { CHARACTERS, ENEMIES, BOSSES, WAVE_SECONDS, DEFAULT_WEAPONS } from '../../data/catalog.js';
import { rollUpgrades, applyUpgrade } from '../../data/upgrades.js';
import { ENEMY_CAP, spawnInterval, spawnCount, computeScore } from '../../shared/rules.js';
import { ARENAS } from '../../data/arenas.js';
import { buildTextures } from '../textures.js';
import { bus } from '../bus.js';
import { sfx } from '../audio.js';
import { getSettings } from '../../lib/settings.js';

export const VIEW_W = 960;
export const VIEW_H = 540;
const WORLD_W = 2400;
const WORLD_H = 1800;
const FONT = '"Press Start 2P", monospace';
const xpNeeded = (lvl) => Math.floor(5 + lvl * 3 + lvl * lvl * 0.5);

// weapon cooldowns (ms) by level
const COOLDOWN = {
  snowball: (l) => Math.max(450, 900 - 30 * l),
  candycane: (l) => Math.max(900, 1700 - 60 * l),
  iceblast: (l) => Math.max(1600, 3200 - 130 * l),
  bomb: (l) => Math.max(1300, 2600 - 100 * l)
};

export default class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init() { this.cfg = this.game.registry.get('runConfig'); }

  create() {
    const cfg = this.cfg;
    const ch = (this.ch = CHARACTERS[cfg.character]);
    this.settings = getSettings();
    this.arena = ARENAS[cfg.arena] || ARENAS.village;
    this.mods = {}; this.hazards = []; this.fires = []; this.delayed = []; this.allies = []; this.zones = [];
    this.storm = null; this.beam = null; this.chimeAt = 0; this.flickerAt = 15000;
    buildTextures(this, cfg.character, cfg.skin, this.arena);
    this.cameras.main.setBackgroundColor(this.arena.bg);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, this.arena.ground).setOrigin(0).setDepth(-1);
    this.buildDecor();

    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.eshots = this.physics.add.group();
    this.gemList = [];
    this.presentList = [];

    // ---- player ----
    this.shadow = this.add.image(WORLD_W / 2, WORLD_H / 2, 'shadow').setDepth(0);
    this.player = this.physics.add.sprite(WORLD_W / 2, WORLD_H / 2, `player_${cfg.character}_${cfg.skin}`);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(18, 22);
    this.shieldRing = this.add.circle(0, 0, 26, 0x7fd8ff, 0.18).setStrokeStyle(2, 0xffffff, 0.8).setVisible(false);

    const boost = cfg.boost;
    this.stats = {
      maxHp: ch.hp + (boost === 'heart_boost' ? 30 : 0), hp: 0, speed: ch.speed, atk: 1, dmg: 1,
      pickup: 70 * (boost === 'magnet_boost' ? 2 : 1), regen: 0, crit: 0.05, xpMult: 1 + (boost === 'xp_boost' ? 0.3 : 0),
      armor: 0, cdr: 0, proj: 0, luck: 0
    };
    this.stats.hp = this.stats.maxHp;
    this.shield = boost === 'shield_boost' ? 50 : 0;
    this.shieldUntil = Infinity;
    this.weapons = { [ch.weapon]: 1 };
    this.available = Array.from(new Set([...(cfg.unlockedWeapons || DEFAULT_WEAPONS), ch.weapon]));
    this.wcd = {};
    this.bells = [];
    this.bellAngle = 0;

    this.run = { kills: 0, killPoints: 0, bosses: 0, presents: 0, level: 1, xp: 0, wave: 1 };
    this.runMs = 0;
    this.waveMs = 0;
    this.spawnAcc = 0;
    this.presentAcc = Phaser.Math.Between(12000, 18000);
    this.invulnUntil = 0;
    this.rageUntil = 0;
    this.sp = { cd: 0, max: 1 };
    this.dash = null;
    this.facing = { x: 1, y: 0 };
    this.pendingLevels = 0;
    this.paused = false;
    this.ended = false;
    this.hudAcc = 0;
    this.boss = null;
    this.popCount = 0;
    this.cards = [];
    this.dark = this.arena.dark ? this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x050818, this.arena.dark).setScrollFactor(0).setDepth(4500) : null;

    // ---- input ----
    this.keys = this.input.keyboard.addKeys({ up: 'W', left: 'A', down: 'S', right: 'D', space: 'SPACE', p: 'P', esc: 'ESC' });
    this.cursors = this.input.keyboard.createCursorKeys();
    this.setupTouch();

    // ---- collisions ----
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHit, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.onTouchEnemy, null, this);
    this.physics.add.overlap(this.player, this.eshots, this.onEnemyShot, null, this);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.fadeIn(400, 14, 22, 48);

    if (this.settings.snow) {
      this.add.particles(0, 0, 'flake', {
        x: { min: 0, max: VIEW_W }, y: -10, lifespan: 6000, speedY: { min: 50, max: 110 }, speedX: { min: -25, max: 25 },
        scale: { min: 1, max: 2 }, alpha: { min: 0.5, max: 1 }, quantity: 1, frequency: 70, tint: this.arena.flake
      }).setScrollFactor(0).setDepth(5000);
    }

    // ---- UI bridge ----
    const offs = [
      bus.on('ui:pick', (i) => this.chooseUpgrade(i)),
      bus.on('ui:pause', () => this.setPaused(true)),
      bus.on('ui:resume', () => this.setPaused(false)),
      bus.on('ui:special', () => this.trySpecial())
    ];
    this.events.once('shutdown', () => offs.forEach((o) => o()));

    bus.emit('ready', { wave: 1 });
    this.emitHud(true);
    bus.emit('wave', { wave: 1, boss: null });
  }

  // =====================================================================
  // World dressing
  // =====================================================================
  buildDecor() {
    const A = this.arena, rnd = Phaser.Math.Between;
    const FLAT = new Set(['snowpile']);
    const prop = (k, x, y) => (FLAT.has(k) ? this.add.image(x, y, k).setDepth(0) : this.add.image(x, y, k).setOrigin(0.5, 1).setDepth(y));
    const b = A.border;
    for (let x = 30; x < WORLD_W; x += 70) { prop(b, x + rnd(-8, 8), 60 + rnd(0, 16)); prop(b, x + rnd(-8, 8), WORLD_H - rnd(0, 14)); }
    for (let y = 130; y < WORLD_H - 40; y += 70) { prop(b, 24 + rnd(0, 14), y); prop(b, WORLD_W - 24 - rnd(0, 14), y); }
    for (let i = 0; i < 26; i++) {
      const x = rnd(120, WORLD_W - 120), y = rnd(160, WORLD_H - 120);
      if (Math.hypot(x - WORLD_W / 2, y - WORLD_H / 2) > 320) prop(b, x, y);
    }
    A.scatter.forEach((k) => { const n = FLAT.has(k) ? 30 : 14; for (let i = 0; i < n; i++) prop(k, rnd(80, WORLD_W - 80), rnd(120, WORLD_H - 80)); });
    for (let i = 0; i < 40; i++) {
      const sp = this.add.image(rnd(40, WORLD_W - 40), rnd(70, WORLD_H - 40), 'spark').setDepth(1).setAlpha(0).setTint(A.spark);
      this.tweens.add({ targets: sp, alpha: 0.9, duration: rnd(700, 1800), yoyo: true, repeat: -1, delay: rnd(0, 2000) });
    }
    for (let i = 0; i < A.sticky; i++) {
      const x = rnd(160, WORLD_W - 160), y = rnd(200, WORLD_H - 160), r = rnd(70, 110);
      if (Math.hypot(x - WORLD_W / 2, y - WORLD_H / 2) < 220) continue;
      this.add.circle(x, y, r, 0xff7ab8, 0.3).setStrokeStyle(4, 0xffffff, 0.4).setDepth(0);
      this.zones.push({ x, y, r });
    }
  }

  setupTouch() {
    this.input.addPointer(2);
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.joyBase = this.add.circle(0, 0, 50, 0xffffff, 0.1).setStrokeStyle(2, 0xffffff, 0.35).setScrollFactor(0).setDepth(6000).setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 22, 0xffffff, 0.35).setScrollFactor(0).setDepth(6001).setVisible(false);
    const touchMode = this.settings.touch === 'on' || (this.settings.touch === 'auto' && this.sys.game.device.input.touch);
    if (touchMode) {
      const bx = VIEW_W - 84, by = VIEW_H - 84;
      this.spBtn = this.add.circle(bx, by, 40, 0xffcf4a, 0.3).setStrokeStyle(3, 0xffffff, 0.7).setScrollFactor(0).setDepth(6000);
      this.spLabel = this.add.text(bx, by, 'GO', { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(6001);
    }
    this.input.on('pointerdown', (p) => {
      if (this.paused || this.ended) return;
      if (this.spBtn && Phaser.Math.Distance.Between(p.x, p.y, this.spBtn.x, this.spBtn.y) < 52) { this.trySpecial(); return; }
      if (!p.wasTouch || this.joy.id !== null || p.x > VIEW_W * 0.62) return;
      Object.assign(this.joy, { id: p.id, ox: p.x, oy: p.y, x: 0, y: 0 });
      this.joyBase.setPosition(p.x, p.y).setVisible(true);
      this.joyKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p) => {
      if (p.id !== this.joy.id) return;
      let dx = p.x - this.joy.ox, dy = p.y - this.joy.oy;
      const len = Math.hypot(dx, dy);
      const max = 50;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      this.joy.x = dx / max; this.joy.y = dy / max;
      this.joyKnob.setPosition(this.joy.ox + dx, this.joy.oy + dy);
    });
    const release = (p) => {
      if (p.id !== this.joy.id) return;
      this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
      this.joyBase.setVisible(false); this.joyKnob.setVisible(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  // =====================================================================
  // Main loop
  // =====================================================================
  update(time, rawDelta) {
    if (this.ended) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.p) || Phaser.Input.Keyboard.JustDown(this.keys.esc)) {
      if (!this.cards.length) { this.setPaused(!this.paused); bus.emit('paused', this.paused); }
    }
    if (this.paused) return;
    const delta = Math.min(rawDelta, 100);
    const dt = delta / 1000;
    this.runMs += delta;

    this.updatePlayer(dt);
    this.updateWeapons(delta, dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateSpawns(delta);
    this.updateGems(dt);
    this.updatePresents(delta);
    this.updateSpecial(delta);
    this.updateEffects(delta, dt);

    this.hudAcc += delta;
    if (this.hudAcc >= 100) { this.hudAcc = 0; this.emitHud(); }
  }

  updatePlayer(dt) {
    const k = this.keys, c = this.cursors;
    let vx = (k.right.isDown || c.right.isDown ? 1 : 0) - (k.left.isDown || c.left.isDown ? 1 : 0);
    let vy = (k.down.isDown || c.down.isDown ? 1 : 0) - (k.up.isDown || c.up.isDown ? 1 : 0);
    if (this.joy.id !== null) { vx = this.joy.x; vy = this.joy.y; }
    if (Phaser.Input.Keyboard.JustDown(k.space)) this.trySpecial();
    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    if (len > 0.15) { this.facing = { x: vx / len, y: vy / len }; if (Math.abs(vx) > 0.1) this.player.setFlipX(vx < 0); this.player.setAngle(Math.sin(this.runMs / 80) * 4); }
    else this.player.setAngle(0);

    if (this.dash && this.runMs < this.dash.until) {
      this.player.setVelocity(this.dash.vx, this.dash.vy);
      this.dashHits();
      if (this.runMs - (this.dash.lastGhost || 0) > 45) {
        this.dash.lastGhost = this.runMs;
        const g = this.add.image(this.player.x, this.player.y, this.player.texture.key).setAlpha(0.5).setDepth(this.player.y - 1).setFlipX(this.player.flipX);
        this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
      }
    } else {
      this.dash = null;
      let sp = this.stats.speed;
      if (this.zones.length && this.inZone()) sp *= 0.55;
      if (this.arena.ice) {
        const k = Math.min(1, dt * 2.6), v = this.player.body.velocity;
        this.player.setVelocity(v.x + (vx * sp - v.x) * k, v.y + (vy * sp - v.y) * k);
      } else this.player.setVelocity(vx * sp, vy * sp);
    }
    this.player.setDepth(this.player.y);
    this.shadow.setPosition(this.player.x, this.player.y + 16);
    if (this.stats.regen > 0) this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.regen * dt);
    if (this.shield > 0 && this.runMs > this.shieldUntil) this.shield = 0;
    this.shieldRing.setVisible(this.shield > 0).setPosition(this.player.x, this.player.y).setDepth(this.player.y + 1);
    this.player.setAlpha(this.runMs < this.invulnUntil && Math.floor(this.runMs / 80) % 2 ? 0.5 : 1);
  }

  // =====================================================================
  // Damage helpers
  // =====================================================================
  dmgOf(base) {
    let d = base * this.stats.dmg * (this.runMs < this.rageUntil ? 1.5 : 1);
    if (Math.random() < this.stats.crit) { d *= 2; this.lastCrit = true; } else this.lastCrit = false;
    return d;
  }

  damageEnemy(e, amt) {
    if (!e.active || e.dead || e.intangible || this.runMs < (e.invulnUntil || 0)) return;
    e.hp -= amt;
    e.setTintFill(0xffffff);
    e.hitFlash = this.runMs + 70;
    sfx('hit');
    if (this.lastCrit && this.popCount < 10) this.popText(e.x, e.y - 20, Math.round(amt) + '!', '#ffd166');
    if (e.hp <= 0) this.killEnemy(e);
  }

  knock(e, nx, ny, force, ms) {
    if (e.boss) { force *= 0.25; }
    e.kvx = nx * force; e.kvy = ny * force; e.kUntil = this.runMs + ms;
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    const def = e.def;
    this.run.kills += 1;
    if (e.boss) {
      this.run.bosses += 1;
      this.run.killPoints += 0; // bosses score through the boss bonus, not kill points
      for (let i = 0; i < 3; i++) this.spawnPresent(e.x + Phaser.Math.Between(-60, 60), e.y + Phaser.Math.Between(-60, 60));
      for (let i = 0; i < 12; i++) this.dropGem(e.x, e.y, 5);
      this.cameras.main.flash(300, 255, 255, 255);
      this.boss = null;
      bus.emit('boss', null);
      sfx('boom');
    } else {
      this.run.killPoints += def.pts * (e.elite ? 3 : 1);
      this.dropGem(e.x, e.y, def.xp * (e.elite ? 4 : 1));
      if (e.elite && Math.random() < 0.3) this.spawnPresent(e.x, e.y);
    }
    this.burst(e.x, e.y, e.elite || e.boss ? 0xffd166 : 0xffffff, e.boss ? 18 : 5);
    sfx('kill');
    e.destroy();
  }

  hurt(raw) {
    if (this.runMs < this.invulnUntil || this.ended) return;
    let dmg = Math.max(raw * 0.3, raw - this.stats.armor);
    if (this.shield > 0) { const a = Math.min(this.shield, dmg); this.shield -= a; dmg -= a; }
    this.invulnUntil = this.runMs + 500;
    sfx('hurt');
    if (this.settings.shake) this.cameras.main.shake(120, 0.004);
    if (dmg > 0) {
      this.stats.hp -= dmg;
      if (this.stats.hp <= 0) { this.stats.hp = 0; this.die(); }
    }
  }

  die() {
    if (this.ended) return;
    this.ended = true;
    this.physics.world.pause();
    this.player.setTint(0xff4444);
    this.tweens.add({ targets: this.player, angle: 90, alpha: 0.4, duration: 600 });
    sfx('over');
    this.emitHud(true);
    this.time.delayedCall(900, () => {
      const seconds = Math.floor(this.runMs / 1000);
      const stats = { killPoints: this.run.killPoints, kills: this.run.kills, bosses: this.run.bosses, wave: this.run.wave, seconds, presents: this.run.presents };
      bus.emit('gameover', { stats, score: computeScore(stats), level: this.run.level });
    });
  }

  onBulletHit(b, e) {
    if (!b.active || !e.active || e.dead || b.kind === undefined) return;
    if (b.kind === 'cane') {
      const t = b.hits.get(e);
      if (t !== undefined && this.runMs - t < 350) return;
      b.hits.set(e, this.runMs);
      this.damageEnemy(e, this.dmgOf(b.dmg));
      if (b.slow && e.active) e.slowUntil = this.runMs + 1500;
      return;
    }
    if (b.lastHit === e) return;
    b.lastHit = e;
    this.damageEnemy(e, this.dmgOf(b.dmg));
    if (b.slow && e.active) e.slowUntil = this.runMs + 2000;
    if (b.split && !b.mini && !b.didSplit) {
      b.didSplit = true;
      for (const d of [-0.7, 0.7]) this.spawnSnowball(b.x, b.y, b.ang + d, b.dmg * 0.5, { mini: true, life: 700, speed: 340, scale: 0.7 }).lastHit = e;
    }
    if (b.pierce > 0) b.pierce -= 1; else b.destroy();
  }

  onTouchEnemy(p, e) {
    if (!e.active || e.dead || e.intangible) return;
    this.hurt(e.dmgVal);
  }

  onEnemyShot(p, s) {
    if (!s.active) return;
    this.hurt(s.dmgVal);
    s.destroy();
  }

  // =====================================================================
  // Weapons
  // =====================================================================
  updateWeapons(delta, dt) {
    for (const id of Object.keys(this.weapons)) {
      if (id === 'bells') continue;
      const lvl = this.weapons[id];
      this.wcd[id] = (this.wcd[id] ?? 300) - delta * this.stats.atk;
      if (this.wcd[id] <= 0) {
        const fired = this[`fire_${id}`](lvl);
        this.wcd[id] = fired ? COOLDOWN[id](lvl) * this.cdMul(id) : 120;
      }
    }
    if (this.weapons.bells) this.updateBells(dt);
  }

  nearestEnemy(maxDist = 560) {
    let best = null, bd = maxDist * maxDist;
    for (const e of this.enemies.getChildren()) {
      if (!e.active || e.dead) continue;
      const d = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  spawnSnowball(x, y, a, dmg, o = {}) {
    const b = this.bullets.create(x, y, 'w_snowball');
    b.kind = 'snowball'; b.dmg = dmg; b.pierce = o.pierce || 0; b.expire = this.runMs + (o.life || 1500);
    b.slow = !!o.slow; b.split = !!o.split; b.mini = !!o.mini; b.ang = a;
    b.setDepth(y + 2); b.body.setSize(10, 10);
    if (o.scale) b.setScale(o.scale);
    b.setVelocity(Math.cos(a) * (o.speed || 400), Math.sin(a) * (o.speed || 400));
    return b;
  }

  fire_snowball(lvl) {
    const t = this.nearestEnemy();
    if (!t) return false;
    const heavy = this.hasMod('snowball', 'heavy');
    const count = 1 + Math.floor((lvl - 1) / 2) + this.stats.proj;
    const base = Math.atan2(t.y - this.player.y, t.x - this.player.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.18;
      this.spawnSnowball(this.player.x, this.player.y, a, (8 + 3 * (lvl - 1)) * (heavy ? 1.6 : 1), {
        pierce: (lvl >= 4 ? 1 : 0) + (heavy ? 1 : 0), slow: this.hasMod('snowball', 'frozen_core'), split: this.hasMod('snowball', 'split'), scale: heavy ? 1.5 : 1
      });
    }
    sfx('shoot');
    return true;
  }

  fire_candycane(lvl) {
    const t = this.nearestEnemy(600);
    if (!t) return false;
    const razor = this.hasMod('candycane', 'razor'), sticky = this.hasMod('candycane', 'sticky');
    const count = 1 + Math.floor((lvl - 1) / 3) + Math.floor(this.stats.proj / 2);
    const base = Math.atan2(t.y - this.player.y, t.x - this.player.x);
    const toss = (a) => {
      const b = this.bullets.create(this.player.x, this.player.y, 'w_candycane');
      b.kind = 'cane'; b.dmg = (12 + 4 * (lvl - 1)) * (razor ? 1.4 : 1); b.back = razor ? 560 : 430; b.slow = sticky;
      b.t0 = this.runMs; b.phase = 'out'; b.hits = new Map(); b.expire = this.runMs + 4000;
      b.setScale(1.4).setDepth(this.player.y + 2); b.body.setSize(14, 14);
      b.setVelocity(Math.cos(a) * 340, Math.sin(a) * 340);
    };
    for (let i = 0; i < count; i++) toss(base + (i - (count - 1) / 2) * 0.5);
    if (this.hasMod('candycane', 'boomerang_pair')) toss(base + Math.PI);
    sfx('shoot');
    return true;
  }

  blastRadius(lvl) { return (90 + 14 * lvl) * (this.hasMod('iceblast', 'glacier') ? 1.3 : 1); }

  fire_iceblast(lvl) {
    const radius = this.blastRadius(lvl);
    const px = this.player.x, py = this.player.y;
    if (!this.enemies.getChildren().some((e) => e.active && !e.dead && Math.hypot(e.x - px, e.y - py) < radius * 1.25)) return false;
    this.novaBlast(lvl);
    if (this.hasMod('iceblast', 'echo')) this.later(500, () => { if (!this.ended) this.novaBlast(lvl); });
    return true;
  }

  novaBlast(lvl) {
    const radius = this.blastRadius(lvl);
    const px = this.player.x, py = this.player.y;
    const dmg = 10 + 4 * lvl;
    const knockback = lvl >= 3 || this.hasMod('iceblast', 'glacier');
    const execute = this.hasMod('iceblast', 'shatter');
    for (const e of this.enemies.getChildren().slice()) {
      if (!e.active || e.dead) continue;
      const d = Math.hypot(e.x - px, e.y - py);
      if (d > radius + 14) continue;
      e.slowUntil = this.runMs + 2000;
      if (knockback) this.knock(e, (e.x - px) / (d || 1), (e.y - py) / (d || 1), 220, 180);
      this.damageEnemy(e, this.dmgOf(dmg));
      if (execute && e.active && !e.dead && !e.boss && e.hp <= e.maxHp * 0.25) this.killEnemy(e);
    }
    this.ring(px, py, radius, 0x7fd8ff);
    sfx('special');
  }

  fire_bomb(lvl) {
    const count = 1 + Math.floor((lvl - 1) / 3) + Math.floor(this.stats.proj / 2);
    const pool = this.enemies.getChildren().filter((e) => e.active && !e.dead && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 460);
    if (!pool.length) return false;
    for (let i = 0; i < count; i++) {
      const t = Phaser.Utils.Array.GetRandom(pool);
      const bomb = this.add.image(this.player.x, this.player.y, 'w_bomb').setScale(1.5).setDepth(3000);
      const tx = t.x, ty = t.y;
      this.tweens.add({
        targets: bomb, x: tx, y: ty, duration: 520, ease: 'Sine.easeOut',
        onUpdate: (tw) => bomb.setAngle(tw.progress * 540),
        onComplete: () => { bomb.destroy(); if (!this.ended) this.detonate(tx, ty, lvl, 1); }
      });
    }
    return true;
  }

  detonate(x, y, lvl, scale) {
    const big = this.hasMod('bomb', 'big_boom');
    const radius = (70 + 8 * lvl) * (big ? 1.4 : 1) * scale;
    const dmg = this.dmgOf(25 + 8 * lvl) * (big ? 1.3 : 1) * scale;
    this.explode(x, y, radius, dmg);
    if (scale < 1) return;
    if (this.hasMod('bomb', 'glaze')) this.addFire(x, y, radius * 0.8, 5 + lvl);
    if (this.hasMod('bomb', 'cluster')) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.random();
        this.later(150 + k * 120, () => { if (!this.ended) this.detonate(x + Math.cos(a) * 90, y + Math.sin(a) * 90, lvl, 0.5); });
      }
    }
  }

  addFire(x, y, r, dmg) {
    const sprite = this.add.circle(x, y, r, 0xff7a00, 0.25).setStrokeStyle(3, 0xffcf4a, 0.6).setDepth(1);
    this.fires.push({ x, y, r, dmg, sprite, until: this.runMs + 3500, next: this.runMs });
  }

  explode(x, y, radius, dmg) {
    for (const e of this.enemies.getChildren().slice()) {
      if (!e.active || e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < radius + 12) this.damageEnemy(e, dmg * (1 - (d / (radius + 12)) * 0.4));
    }
    this.ring(x, y, radius, 0xff9a3c);
    this.burst(x, y, 0xffcf4a, 8);
    sfx('boom');
    if (this.settings.shake) this.cameras.main.shake(90, 0.003);
  }

  updateBells(dt) {
    const lvl = this.weapons.bells;
    const tuned = this.hasMod('bells', 'tuned');
    const count = 2 + Math.floor((lvl - 1) / 2) + Math.floor(this.stats.proj / 2) + (this.hasMod('bells', 'resonance') ? 2 : 0);
    while (this.bells.length < count) this.bells.push(this.add.image(0, 0, 'w_bells').setScale(1.8));
    while (this.bells.length > count) this.bells.pop().destroy();
    const radius = 66 + 5 * lvl;
    this.bellAngle += (2.6 + 0.2 * lvl) * dt * Math.min(1.8, 0.7 + 0.3 * this.stats.atk);
    const dmg = (7 + 2.5 * lvl) * (tuned ? 1.4 : 1);
    this.bells.forEach((b, i) => {
      const a = this.bellAngle + (i * Math.PI * 2) / count;
      b.setPosition(this.player.x + Math.cos(a) * radius, this.player.y + Math.sin(a) * radius).setDepth(this.player.y + 3).setAngle(Math.sin(this.runMs / 70 + i) * 18).setScale(tuned ? 2.4 : 1.8);
      for (const e of this.enemies.getChildren()) {
        if (!e.active || e.dead) continue;
        if (this.runMs < (e.bellUntil || 0)) continue;
        const reach = 20 + (e.boss ? 40 : 10) + (tuned ? 10 : 0);
        if (Math.abs(e.x - b.x) < reach && Math.abs(e.y - b.y) < reach) {
          e.bellUntil = this.runMs + 450;
          const d = Math.hypot(e.x - this.player.x, e.y - this.player.y) || 1;
          this.knock(e, (e.x - this.player.x) / d, (e.y - this.player.y) / d, 160, 120);
          this.damageEnemy(e, this.dmgOf(dmg));
        }
      }
    });
    if (this.hasMod('bells', 'chime') && this.runMs >= this.chimeAt) {
      this.chimeAt = this.runMs + 3000;
      for (const e of this.enemies.getChildren().slice()) {
        if (e.active && !e.dead && Math.hypot(e.x - this.player.x, e.y - this.player.y) < 160) this.damageEnemy(e, this.dmgOf(dmg * 1.5));
      }
      this.ring(this.player.x, this.player.y, 160, 0xffcf4a);
      sfx('wave');
    }
  }

  updateBullets() {
    for (const b of this.bullets.getChildren().slice()) {
      if (!b.active) continue;
      if (this.runMs > b.expire) { b.destroy(); continue; }
      if (b.kind === 'cane') {
        b.rotation += 0.35;
        if (b.phase === 'out' && this.runMs - b.t0 > 650) { b.phase = 'back'; b.hits.clear(); }
        if (b.phase === 'back') {
          const dx = this.player.x - b.x, dy = this.player.y - b.y, d = Math.hypot(dx, dy) || 1;
          if (d < 24) { b.destroy(); continue; }
          b.setVelocity((dx / d) * (b.back || 430), (dy / d) * (b.back || 430));
        }
      } else b.rotation += 0.2;
    }
    for (const s of this.eshots.getChildren().slice()) if (s.active && this.runMs > s.expire) s.destroy();
  }

  // =====================================================================
  // Special abilities
  // =====================================================================
  trySpecial() {
    if (this.sp.cd > 0 || this.ended || this.paused) return;
    const ab = this.ch.ability;
    const cd = ab.cd * 1000 * (1 - this.stats.cdr);
    this.sp.cd = cd; this.sp.max = cd;
    sfx('special');
    const px = this.player.x, py = this.player.y, f = this.facing;
    switch (ab.id) {
      case 'sackslam': {
        const r = 200;
        for (const e of this.enemies.getChildren().slice()) {
          if (!e.active || e.dead) continue;
          const d = Math.hypot(e.x - px, e.y - py);
          if (d > r) continue;
          this.knock(e, (e.x - px) / (d || 1), (e.y - py) / (d || 1), 420, 260);
          this.damageEnemy(e, this.dmgOf(45));
        }
        this.ring(px, py, r, 0xffffff);
        if (this.settings.shake) this.cameras.main.shake(200, 0.008);
        break;
      }
      case 'jingledash':
        this.dash = { until: this.runMs + 280, vx: f.x * 560, vy: f.y * 560, dmg: 34, hit: new Set() };
        this.invulnUntil = Math.max(this.invulnUntil, this.runMs + 450);
        break;
      case 'blizzardstorm':
        this.storm = { until: this.runMs + 5000, r: 220, next: 0, sprite: this.add.circle(px, py, 220, 0x99ddff, 0.16).setStrokeStyle(4, 0xffffff, 0.6).setDepth(1) };
        this.popText(px, py - 30, 'BLIZZARD', '#99ddff');
        break;
      case 'rednosebeam':
        this.beam = { until: this.runMs + 3000, angle: Math.atan2(f.y, f.x), next: 0, sprite: this.add.rectangle(px, py, 340, 22, 0xff3b3b, 0.7).setOrigin(0, 0.5).setDepth(3400) };
        break;
      case 'garrison':
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3;
          const sprite = this.add.image(px + Math.cos(a) * 50, py + Math.sin(a) * 50, `player_${this.cfg.character}_${this.cfg.skin}`).setScale(0.75).setTint(0xffe0a0);
          this.allies.push({ sprite, until: this.runMs + 8000, hitAt: 0 });
        }
        this.popText(px, py - 30, 'GARRISON!', '#ffd166');
        break;
      default: break;
    }
  }

  dashHits() {
    const d = this.dash;
    for (const e of this.enemies.getChildren()) {
      if (!e.active || e.dead || d.hit.has(e)) continue;
      if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 34 + (e.boss ? 30 : 0)) {
        d.hit.add(e);
        if (d.knock) this.knock(e, d.vx / 480, d.vy / 480, 380, 220);
        this.damageEnemy(e, this.dmgOf(d.dmg));
      }
    }
  }

  updateSpecial(delta) { if (this.sp.cd > 0) this.sp.cd = Math.max(0, this.sp.cd - delta); }

  // =====================================================================
  // Enemies, waves and bosses
  // =====================================================================
  updateSpawns(delta) {
    this.waveMs += delta;
    if (this.waveMs >= WAVE_SECONDS * 1000) {
      this.waveMs -= WAVE_SECONDS * 1000;
      this.run.wave += 1;
      sfx('wave');
      const isBoss = this.run.wave % 5 === 0;
      bus.emit('wave', { wave: this.run.wave, boss: isBoss });
      if (isBoss) this.spawnBoss();
    }
    this.spawnAcc += delta;
    const iv = spawnInterval(this.run.wave);
    while (this.spawnAcc >= iv) {
      this.spawnAcc -= iv;
      if (this.enemies.getLength() < ENEMY_CAP) for (let i = 0; i < spawnCount(this.run.wave); i++) this.spawnRandomEnemy();
    }
  }

  pickType() {
    const w = this.run.wave, A = this.arena;
    const opts = Object.values(ENEMIES).filter((d) => (d.id === 'ghost' && A.ghostFrom ? A.ghostFrom : d.from) <= w);
    const weights = opts.map((d) => (d.weight + (w > d.from ? Math.min(3, (w - d.from) * 0.15) : 0)) * (A.bias[d.id] || 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) return opts[i].id; }
    return opts[0].id;
  }

  spawnRandomEnemy() {
    const a = Math.random() * Math.PI * 2;
    const r = 540 + Math.random() * 80;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * r, 60, WORLD_W - 60);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * r, 90, WORLD_H - 60);
    const w = this.run.wave;
    const elite = w >= 3 && Math.random() < Math.min(0.08, 0.02 + w * 0.004);
    this.spawnEnemy(this.pickType(), x, y, { elite });
  }

  spawnEnemy(type, x, y, opts = {}) {
    const def = ENEMIES[type];
    const w = this.run.wave;
    const e = this.enemies.create(x, y, `e_${type}`);
    e.def = def; e.ai = def.ai; e.elite = !!opts.elite; e.boss = false;
    e.maxHp = e.hp = def.hp * (1 + (w - 1) * 0.16 + Math.pow(w, 1.3) * 0.02) * (e.elite ? 3 : 1);
    e.spd = def.speed * (1 + Math.min(0.5, (w - 1) * 0.012)) * (e.elite ? 1.1 : 1);
    e.dmgVal = def.dmg * (1 + (w - 1) * 0.04) * (e.elite ? 1.3 : 1);
    e.phase = Math.random() * 6;
    e.nextCharge = this.runMs + 1500 + Math.random() * 2000;
    e.frozenUntil = 0; e.slowUntil = 0; e.kUntil = 0; e.hitFlash = 0; e.charge = null;
    e.body.setSize(22, 24);
    if (e.elite) { e.setScale(1.35); e.baseTint = 0xffd166; e.setTint(0xffd166); }
    return e;
  }

  spawnBoss() {
    const cycle = this.run.wave / 5 - 1;
    const def = BOSSES[cycle % BOSSES.length];
    const tier = Math.floor(cycle / BOSSES.length);
    const base = ENEMIES[def.base];
    const a = Math.random() * Math.PI * 2;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * 460, 80, WORLD_W - 80);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * 460, 110, WORLD_H - 80);
    const e = this.enemies.create(x, y, `e_${def.base}`);
    e.def = base; e.ai = 'chase'; e.boss = true; e.elite = false; e.bossDef = def; e.phase = 1; e.moveIdx = 0; e.bossWind = 0; e.bossDash = null; e.invulnUntil = 0;
    e.maxHp = e.hp = (500 + this.run.wave * 70) * def.hpMul * (1 + tier * 0.5);
    e.spd = def.speed; e.dmgVal = def.dmg * (1 + tier * 0.3);
    e.nextCharge = 0; e.nextMove = this.runMs + 2200;
    e.frozenUntil = 0; e.slowUntil = 0; e.kUntil = 0; e.hitFlash = 0; e.charge = null;
    e.shots = def.shots + tier * 2;
    e.body.setSize(22, 24);
    e.setScale(def.scale); e.baseTint = def.tint; e.setTint(def.tint);
    this.boss = e;
    sfx('boss');
    bus.emit('boss', { name: def.name, hp: e.hp, max: e.maxHp, phase: 1 });
    this.cameras.main.flash(400, 255, 60, 60);
  }

  updateEnemies() {
    const px = this.player.x, py = this.player.y;
    const list = this.enemies.getChildren();
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e.active || e.dead) continue;
      e.setDepth(e.y);
      if (e.hitFlash && this.runMs > e.hitFlash) { e.hitFlash = 0; e.clearTint(); if (e.baseTint && !(this.runMs < e.frozenUntil)) e.setTint(e.baseTint); else if (this.runMs < e.frozenUntil) e.setTint(0x99ddff); }
      if (e.frozenUntil && this.runMs >= e.frozenUntil) { e.frozenUntil = 0; e.clearTint(); if (e.baseTint) e.setTint(e.baseTint); }
      if (this.runMs < e.frozenUntil) { e.setVelocity(0, 0); continue; }
      if (this.runMs < e.kUntil) { e.setVelocity(e.kvx, e.kvy); continue; }

      const dx = px - e.x, dy = py - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      const spd = e.spd * (this.runMs < e.slowUntil ? 0.5 : 1);
      e.setFlipX(dx < 0);

      if (e.boss && this.bossTick(e, nx, ny)) continue;

      if (e.ai === 'swarm') {
        const a = Math.atan2(ny, nx) + Math.sin(this.runMs / 260 + e.phase) * 0.5;
        e.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
      } else if (e.ai === 'ghost') {
        const a = Math.atan2(ny, nx) + Math.sin(this.runMs / 450 + e.phase) * 0.9;
        e.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
        const ghostly = (this.runMs + e.phase * 1000) % 4000 < 900;
        e.intangible = ghostly;
        e.setAlpha(ghostly ? 0.35 : 1);
      } else if (e.ai === 'charge') {
        if (e.charge === 'wind') {
          e.setVelocity(0, 0);
          if (this.runMs > e.chargeT) { e.charge = 'dash'; e.chargeT = this.runMs + 550; e.dirx = nx; e.diry = ny; }
        } else if (e.charge === 'dash') {
          e.setVelocity(e.dirx * spd * 3.4, e.diry * spd * 3.4);
          if (this.runMs > e.chargeT) { e.charge = null; e.nextCharge = this.runMs + 3200 + Math.random() * 1500; }
        } else {
          e.setVelocity(nx * spd, ny * spd);
          if (dist < 300 && this.runMs > e.nextCharge) { e.charge = 'wind'; e.chargeT = this.runMs + 500; e.setTintFill(0xff2a2a); e.hitFlash = this.runMs + 500; }
        }
      } else {
        e.setVelocity(nx * spd, ny * spd);
      }

    }
    if (this.boss && this.boss.active) this.bossBroadcast();
  }

  bossBroadcast() {
    this.bossAcc = (this.bossAcc || 0) + 1;
    if (this.bossAcc % 6 === 0) bus.emit('boss', { name: this.boss.bossDef.name, hp: Math.max(0, this.boss.hp), max: this.boss.maxHp, phase: this.boss.phase });
  }

  // =====================================================================
  // Gems & presents
  // =====================================================================
  dropGem(x, y, xp) {
    if (this.gemList.length > 220) { this.addXp(xp); return; }
    const key = xp >= 25 ? 'gem_l' : xp >= 4 ? 'gem_m' : 'gem_s';
    const g = this.add.image(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10), key).setDepth(2);
    g.xp = xp; g.attract = false;
    this.gemList.push(g);
  }

  updateGems(dt) {
    const px = this.player.x, py = this.player.y, pr = this.stats.pickup;
    for (let i = this.gemList.length - 1; i >= 0; i--) {
      const g = this.gemList[i];
      const dx = px - g.x, dy = py - g.y, d = Math.hypot(dx, dy);
      if (d < pr) g.attract = true;
      if (g.attract) {
        g.speed = Math.min(700, (g.speed || 160) + 900 * dt);
        g.x += (dx / (d || 1)) * g.speed * dt; g.y += (dy / (d || 1)) * g.speed * dt;
      }
      if (d < 16) {
        this.gemList.splice(i, 1); g.destroy();
        sfx('gem');
        this.addXp(g.xp);
        if (this.paused) break;
      }
    }
  }

  addXp(n) {
    this.run.xp += n * this.stats.xpMult * this.arena.xpBonus;
    while (this.run.xp >= xpNeeded(this.run.level)) {
      this.run.xp -= xpNeeded(this.run.level);
      this.run.level += 1;
      this.pendingLevels += 1;
    }
    if (this.pendingLevels > 0 && !this.paused && this.cards.length === 0) this.startLevelUp();
  }

  startLevelUp() {
    this.cards = rollUpgrades({ wave: this.run.wave, luck: this.stats.luck, weapons: this.weapons, mods: this.mods, available: this.available });
    this.freeze(true);
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * 0.1);
    sfx('level');
    bus.emit('levelup', { level: this.run.level - this.pendingLevels + 1, cards: this.cards });
  }

  chooseUpgrade(i) {
    if (!this.cards.length || !this.cards[i]) return;
    applyUpgrade(this.cards[i], this.stats, this.weapons, this.mods);
    this.cards = [];
    this.pendingLevels -= 1;
    if (this.pendingLevels > 0) this.startLevelUp();
    else { this.freeze(false); bus.emit('levelup', null); }
  }

  spawnPresent(x, y) {
    if (this.presentList.length >= 6) return;
    const px = Phaser.Math.Clamp(x, 80, WORLD_W - 80), py = Phaser.Math.Clamp(y, 110, WORLD_H - 80);
    // Real presents glow gold and pulse, so they can never be mistaken for scenery.
    const glow = this.add.circle(px, py, 20, 0xffcf4a, 0.4).setStrokeStyle(2, 0xffffff, 0.7).setDepth(py - 1);
    this.tweens.add({ targets: glow, scale: { from: 1, to: 1.9 }, alpha: { from: 0.5, to: 0.08 }, duration: 800, repeat: -1 });
    const p = this.add.image(px, py, 'present').setScale(1.5);
    p.born = this.runMs; p.glow = glow;
    this.tweens.add({ targets: p, scale: 1.8, duration: 450, yoyo: true, repeat: -1 });
    this.presentList.push(p);
  }

  discardPresent(p) {
    this.tweens.killTweensOf(p);
    if (p.glow) { this.tweens.killTweensOf(p.glow); p.glow.destroy(); }
    p.destroy();
  }

  updatePresents(delta) {
    this.presentAcc -= delta;
    if (this.presentAcc <= 0) {
      this.presentAcc = Phaser.Math.Between(22000, 32000);
      const a = Math.random() * Math.PI * 2, r = 220 + Math.random() * 180;
      this.spawnPresent(this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r);
    }
    for (let i = this.presentList.length - 1; i >= 0; i--) {
      const p = this.presentList[i];
      p.setDepth(p.y);
      if (this.runMs - p.born > 45000) { this.discardPresent(p); this.presentList.splice(i, 1); continue; }
      if (Math.hypot(this.player.x - p.x, this.player.y - p.y) < 30) {
        this.discardPresent(p); this.presentList.splice(i, 1);
        this.openPresent();
      }
    }
  }

  openPresent() {
    this.run.presents += 1;
    sfx('present');
    const table = [
      ['heal', 30], ['xp', 25], ['bomb', 12], ['magnet', 12], ['freeze', 8], ['rage', 6], ['shield', 7], ['cursed', 6]
    ];
    let r = Math.random() * table.reduce((a, t) => a + t[1], 0), pick = 'heal';
    for (const [id, w] of table) { r -= w; if (r <= 0) { pick = id; break; } }
    const px = this.player.x, py = this.player.y;
    let label = '';
    switch (pick) {
      case 'heal': this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * 0.35); label = 'COZY COCOA +HP'; break;
      case 'xp': this.addXp(10 + this.run.level * 4); label = 'XP SPARKLE'; break;
      case 'bomb':
        for (const e of this.enemies.getChildren().slice()) if (e.active && !e.dead && Math.hypot(e.x - px, e.y - py) < 480) this.damageEnemy(e, 30 + this.run.wave * 5);
        this.ring(px, py, 480, 0xff9a3c); this.cameras.main.flash(200, 255, 220, 150); label = 'SNOW GLOBE BLAST'; break;
      case 'magnet': this.gemList.forEach((g) => { g.attract = true; }); label = 'MAGNET!'; break;
      case 'freeze':
        for (const e of this.enemies.getChildren()) if (e.active && !e.dead) { e.frozenUntil = this.runMs + (e.boss ? 1500 : 3000); e.setTint(0x99ddff); }
        label = 'DEEP FREEZE'; break;
      case 'rage': this.rageUntil = this.runMs + 10000; label = 'RAGE +50% DMG'; break;
      case 'shield': this.shield = Math.max(this.shield, 40); this.shieldUntil = this.runMs + 10000; label = 'SHIELD'; break;
      default:
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.spawnEnemy(this.pickType(), Phaser.Math.Clamp(px + Math.cos(a) * 300, 60, WORLD_W - 60), Phaser.Math.Clamp(py + Math.sin(a) * 300, 90, WORLD_H - 60));
        }
        label = 'NAUGHTY LIST!'; break;
    }
    this.popText(px, py - 36, label, pick === 'cursed' ? '#ff6b6b' : '#ffd166');
  }

  // =====================================================================
  // Effects
  // =====================================================================
  popText(x, y, str, color = '#ffffff') {
    this.popCount += 1;
    const t = this.add.text(x, y, str, { fontFamily: FONT, fontSize: '10px', color, stroke: '#0e1630', strokeThickness: 4 }).setOrigin(0.5).setDepth(4000);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 900, onComplete: () => { t.destroy(); this.popCount -= 1; } });
  }

  ring(x, y, radius, color) {
    const c = this.add.circle(x, y, 12, color, 0.3).setStrokeStyle(4, color, 0.9).setDepth(3500);
    this.tweens.add({ targets: c, scale: radius / 12, alpha: 0, duration: 380, onComplete: () => c.destroy() });
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const b = this.add.image(x, y, 'bit').setTint(color).setDepth(3000);
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 28;
      this.tweens.add({ targets: b, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 380, onComplete: () => b.destroy() });
    }
  }

  // =====================================================================
  // Mods, timed effects, hazards
  // =====================================================================
  hasMod(w, id) { return (this.mods[w] || []).includes(id); }

  cdMul(id) { return id === 'snowball' && this.hasMod('snowball', 'heavy') ? 1.25 : 1; }

  later(ms, fn) { this.delayed.push({ at: this.runMs + ms, fn }); }

  inZone() {
    for (const z of this.zones) if (Math.hypot(this.player.x - z.x, this.player.y - z.y) < z.r) return true;
    return false;
  }

  nearestTo(x, y, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const e of this.enemies.getChildren()) {
      if (!e.active || e.dead) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  updateEffects(delta, dt) {
    const px = this.player.x, py = this.player.y, now = this.runMs;

    if (this.delayed.length) {
      const due = this.delayed.filter((d) => d.at <= now);
      if (due.length) { this.delayed = this.delayed.filter((d) => d.at > now); due.forEach((d) => d.fn()); }
    }

    const st = this.storm;
    if (st) {
      st.sprite.setPosition(px, py);
      if (now >= st.next) {
        st.next = now + 500;
        for (const e of this.enemies.getChildren().slice()) {
          if (!e.active || e.dead || Math.hypot(e.x - px, e.y - py) > st.r) continue;
          e.slowUntil = now + 700;
          this.damageEnemy(e, this.dmgOf(9));
        }
      }
      if (now >= st.until) {
        for (const e of this.enemies.getChildren().slice()) {
          if (!e.active || e.dead || Math.hypot(e.x - px, e.y - py) > st.r + 20) continue;
          this.damageEnemy(e, this.dmgOf(50));
          if (e.active && !e.dead && !e.boss) { e.frozenUntil = now + 1500; e.setTint(0x99ddff); }
        }
        this.ring(px, py, st.r + 20, 0xffffff);
        st.sprite.destroy(); this.storm = null;
        sfx('boom');
      }
    }

    const bm = this.beam;
    if (bm) {
      bm.angle += 3.2 * dt;
      bm.sprite.setPosition(px, py);
      bm.sprite.rotation = bm.angle;
      if (now >= bm.next) {
        bm.next = now + 120;
        const c = Math.cos(bm.angle), s = Math.sin(bm.angle);
        for (const e of this.enemies.getChildren().slice()) {
          if (!e.active || e.dead) continue;
          const dx = e.x - px, dy = e.y - py;
          const along = dx * c + dy * s, perp = Math.abs(-dx * s + dy * c);
          if (along > -10 && along < 350 && perp < 18 + (e.boss ? 34 : 10)) this.damageEnemy(e, this.dmgOf(8));
        }
      }
      if (now >= bm.until) { bm.sprite.destroy(); this.beam = null; }
    }

    for (let i = this.allies.length - 1; i >= 0; i--) {
      const a = this.allies[i];
      if (now >= a.until) { a.sprite.destroy(); this.allies.splice(i, 1); continue; }
      const tgt = this.nearestTo(a.sprite.x, a.sprite.y, 700);
      const tx = tgt ? tgt.x : px + Math.cos(i * 2 + now / 900) * 60;
      const ty = tgt ? tgt.y : py + Math.sin(i * 2 + now / 900) * 60;
      const dx = tx - a.sprite.x, dy = ty - a.sprite.y, d = Math.hypot(dx, dy) || 1;
      a.sprite.x += (dx / d) * 190 * dt; a.sprite.y += (dy / d) * 190 * dt;
      a.sprite.setDepth(a.sprite.y).setFlipX(dx < 0).setAngle(Math.sin(now / 80 + i) * 6);
      if (tgt && now >= a.hitAt && d < 32) {
        a.hitAt = now + 350;
        this.knock(tgt, dx / d, dy / d, 200, 120);
        this.damageEnemy(tgt, this.dmgOf(15));
      }
    }

    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      if (now >= f.until) { f.sprite.destroy(); this.fires.splice(i, 1); continue; }
      if (now >= f.next) {
        f.next = now + 400;
        for (const e of this.enemies.getChildren().slice()) {
          if (e.active && !e.dead && Math.hypot(e.x - f.x, e.y - f.y) < f.r) this.damageEnemy(e, this.dmgOf(f.dmg));
        }
      }
    }

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.g.setAlpha(0.45 + 0.35 * Math.sin(now / 70));
      if (now >= h.at) {
        if (Math.hypot(px - h.x, py - h.y) < h.r) this.hurt(h.dmg);
        this.ring(h.x, h.y, h.r, 0xff5533);
        h.g.destroy(); this.hazards.splice(i, 1);
      }
    }

    if (this.dark && now >= this.flickerAt) {
      this.flickerAt = now + 14000 + Math.random() * 6000;
      this.dark.setAlpha(0.78);
      this.later(350, () => this.dark.setAlpha(this.arena.dark));
    }
  }

  // =====================================================================
  // Boss attack patterns (two phases)
  // =====================================================================
  bossDmg() { return 8 + this.run.wave * 0.5; }

  eshot(x, y, a, speed, dmg) {
    const b = this.eshots.create(x, y, 'ebullet');
    b.dmgVal = dmg; b.expire = this.runMs + 4500; b.body.setSize(8, 8);
    b.setDepth(y + 1).setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    return b;
  }

  telegraph(x, y, r, delay, dmg) {
    const cx = Phaser.Math.Clamp(x, 40, WORLD_W - 40), cy = Phaser.Math.Clamp(y, 60, WORLD_H - 40);
    const g = this.add.circle(cx, cy, r, 0xff2a2a, 0.25).setStrokeStyle(3, 0xff8a8a, 0.9).setDepth(1);
    this.hazards.push({ x: cx, y: cy, r, at: this.runMs + delay, dmg, g });
  }

  bossTick(e, nx, ny) {
    const now = this.runMs;
    if (e.phase === 1 && e.hp <= e.maxHp * 0.5) this.enterPhase2(e);
    if (e.bossWind) {
      if (now < e.bossWind) { e.setVelocity(0, 0); return true; }
      e.bossWind = 0; e.clearTint(); e.setTint(e.baseTint);
      const sp = Math.max(320, e.spd * 5);
      e.bossDash = { until: now + 520, vx: e.dashDx * sp, vy: e.dashDy * sp };
    }
    if (e.bossDash) {
      if (now < e.bossDash.until) { e.setVelocity(e.bossDash.vx, e.bossDash.vy); return true; }
      e.bossDash = null;
    }
    if (now >= e.nextMove) {
      const list = e.bossDef.moves[e.phase];
      const move = list[e.moveIdx % list.length];
      e.moveIdx += 1;
      e.nextMove = now + (e.phase === 2 ? 1700 : 2400) + Math.random() * 500;
      this[`bm_${move}`](e, nx, ny);
    }
    return false;
  }

  enterPhase2(e) {
    e.phase = 2; e.invulnUntil = this.runMs + 1200; e.spd *= 1.25; e.shots += 4;
    e.moveIdx = 0; e.nextMove = this.runMs + 1500; e.bossWind = 0; e.bossDash = null;
    e.setAlpha(1); e.baseTint = 0xff5a5a; e.setTint(0xff5a5a);
    this.cameras.main.flash(300, 255, 60, 60);
    if (this.settings.shake) this.cameras.main.shake(300, 0.006);
    this.ring(e.x, e.y, 260, 0xff2a2a);
    this.popText(e.x, e.y - 60, 'ENRAGED!', '#ff6b6b');
    this.eshots.getChildren().slice().forEach((s) => s.destroy());
    sfx('boss');
    bus.emit('bossphase', { name: e.bossDef.name, phase: 2 });
  }

  bm_ring(e) {
    const n = e.shots, off = Math.random() * Math.PI;
    for (let i = 0; i < n; i++) this.eshot(e.x, e.y, off + (i / n) * Math.PI * 2, 150, this.bossDmg());
    sfx('shoot');
  }

  bm_fan(e, nx, ny) {
    const base = Math.atan2(ny, nx), n = e.phase === 2 ? 7 : 5;
    for (let i = 0; i < n; i++) this.eshot(e.x, e.y, base + (i - (n - 1) / 2) * 0.26, 220, this.bossDmg());
    sfx('shoot');
  }

  bm_spiral(e) {
    const volleys = e.phase === 2 ? 10 : 7;
    for (let v = 0; v < volleys; v++) {
      this.later(v * 140, () => {
        if (!e.active || e.dead || this.ended) return;
        for (let k = 0; k < 3; k++) this.eshot(e.x, e.y, v * 0.45 + (k * Math.PI * 2) / 3, 135, this.bossDmg());
      });
    }
  }

  bm_rain(e) {
    const n = e.phase === 2 ? 9 : 6, rnd = Phaser.Math.Between;
    for (let i = 0; i < n; i++) this.telegraph(this.player.x + rnd(-240, 240), this.player.y + rnd(-200, 200), 62, 900 + i * 60, this.bossDmg() * 1.6);
    this.telegraph(this.player.x, this.player.y, 62, 800, this.bossDmg() * 1.6);
  }

  bm_slam(e) {
    this.telegraph(this.player.x, this.player.y, 110, 850, this.bossDmg() * 2);
    if (e.phase === 2) this.telegraph(e.x, e.y, 150, 1000, this.bossDmg() * 2);
  }

  bm_summon(e) {
    const t = e.bossDef.minion;
    if (!t) return;
    const n = e.phase === 2 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Phaser.Math.Clamp(e.x + Math.cos(a) * 90, 60, WORLD_W - 60), y = Phaser.Math.Clamp(e.y + Math.sin(a) * 90, 90, WORLD_H - 60);
      this.spawnEnemy(t, x, y);
      this.burst(x, y, 0xb050ff, 4);
    }
  }

  bm_dash(e, nx, ny) {
    e.bossWind = this.runMs + 650; e.dashDx = nx; e.dashDy = ny;
    e.setTintFill(0xff2a2a);
  }

  bm_blink(e) {
    e.setAlpha(0.15);
    this.later(500, () => {
      if (!e.active || e.dead || this.ended) return;
      const a = Math.random() * Math.PI * 2;
      e.setPosition(Phaser.Math.Clamp(this.player.x + Math.cos(a) * 170, 60, WORLD_W - 60), Phaser.Math.Clamp(this.player.y + Math.sin(a) * 170, 90, WORLD_H - 60));
      e.setAlpha(1);
      const dx = this.player.x - e.x, dy = this.player.y - e.y, d = Math.hypot(dx, dy) || 1;
      this.bm_fan(e, dx / d, dy / d);
    });
  }

  // =====================================================================
  // Pause + HUD
  // =====================================================================
  freeze(on) {
    this.paused = on;
    if (on) { this.physics.world.pause(); this.tweens.pauseAll(); } else { this.physics.world.resume(); this.tweens.resumeAll(); }
  }

  setPaused(on) {
    if (this.ended || this.cards.length) return;
    if (on === this.paused) return;
    this.freeze(on);
    bus.emit('paused', on);
  }

  emitHud(force) {
    bus.emit('hud', {
      hp: Math.ceil(this.stats.hp), maxHp: Math.round(this.stats.maxHp), shield: Math.ceil(this.shield),
      xp: this.run.xp, xpNext: xpNeeded(this.run.level), level: this.run.level, wave: this.run.wave,
      waveLeft: Math.max(0, Math.ceil((WAVE_SECONDS * 1000 - this.waveMs) / 1000)), kills: this.run.kills,
      score: computeScore({ killPoints: this.run.killPoints, bosses: this.run.bosses, wave: this.run.wave, seconds: this.runMs / 1000, presents: this.run.presents }),
      special: { cd: this.sp.cd, max: this.sp.max, name: this.ch.ability.name },
      weapons: { ...this.weapons }, mods: Object.fromEntries(Object.entries(this.mods).map(([k, v]) => [k, v.length])), rage: this.runMs < this.rageUntil, time: Math.floor(this.runMs / 1000), force: !!force
    });
  }
}
