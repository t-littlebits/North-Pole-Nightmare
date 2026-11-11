import Phaser from 'phaser';
import { CHARACTERS, ENEMIES, BOSSES, WAVE_SECONDS, DEFAULT_WEAPONS } from '../../data/catalog.js';
import { rollUpgrades, applyUpgrade } from '../../data/upgrades.js';
import { ENEMY_CAP, spawnInterval, spawnCount, computeScore } from '../../shared/rules.js';
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
    buildTextures(this, cfg.character, cfg.skin);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'ground').setOrigin(0).setDepth(-1);
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
        scale: { min: 1, max: 2 }, alpha: { min: 0.5, max: 1 }, quantity: 1, frequency: 70
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
    const rnd = Phaser.Math.Between;
    const tree = (x, y) => this.add.image(x, y, 'tree').setOrigin(0.5, 1).setDepth(y);
    for (let x = 30; x < WORLD_W; x += 70) { tree(x + rnd(-8, 8), 60 + rnd(0, 16)); tree(x + rnd(-8, 8), WORLD_H - rnd(0, 14)); }
    for (let y = 130; y < WORLD_H - 40; y += 70) { tree(24 + rnd(0, 14), y); tree(WORLD_W - 24 - rnd(0, 14), y); }
    for (let i = 0; i < 26; i++) {
      const x = rnd(120, WORLD_W - 120), y = rnd(160, WORLD_H - 120);
      if (Math.hypot(x - WORLD_W / 2, y - WORLD_H / 2) > 320) tree(x, y);
    }
    for (let i = 0; i < 34; i++) this.add.image(rnd(80, WORLD_W - 80), rnd(100, WORLD_H - 80), 'snowpile').setDepth(0);
    for (let i = 0; i < 20; i++) { const y = rnd(140, WORLD_H - 80); this.add.image(rnd(80, WORLD_W - 80), y, 'cane_post').setOrigin(0.5, 1).setDepth(y); }
    for (let i = 0; i < 18; i++) { const y = rnd(140, WORLD_H - 80); this.add.image(rnd(80, WORLD_W - 80), y, 'present').setOrigin(0.5, 1).setDepth(y).setTint(0xaab4d6).setScale(1.2); }
    for (let i = 0; i < 40; i++) {
      const s = this.add.image(rnd(40, WORLD_W - 40), rnd(70, WORLD_H - 40), 'spark').setDepth(1).setAlpha(0);
      this.tweens.add({ targets: s, alpha: 0.9, duration: rnd(700, 1800), yoyo: true, repeat: -1, delay: rnd(0, 2000) });
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
      this.player.setVelocity(vx * this.stats.speed, vy * this.stats.speed);
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
    if (!e.active || e.dead || e.intangible) return;
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
      return;
    }
    if (b.lastHit === e) return;
    b.lastHit = e;
    this.damageEnemy(e, this.dmgOf(b.dmg));
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
        this.wcd[id] = fired ? COOLDOWN[id](lvl) : 120;
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

  fire_snowball(lvl) {
    const t = this.nearestEnemy();
    if (!t) return false;
    const count = 1 + Math.floor((lvl - 1) / 2) + this.stats.proj;
    const base = Math.atan2(t.y - this.player.y, t.x - this.player.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.18;
      const b = this.bullets.create(this.player.x, this.player.y, 'w_snowball');
      b.kind = 'snowball'; b.dmg = 8 + 3 * (lvl - 1); b.pierce = lvl >= 4 ? 1 : 0; b.expire = this.runMs + 1500;
      b.setDepth(this.player.y + 2); b.body.setSize(10, 10);
      b.setVelocity(Math.cos(a) * 400, Math.sin(a) * 400);
    }
    sfx('shoot');
    return true;
  }

  fire_candycane(lvl) {
    const t = this.nearestEnemy(600);
    if (!t) return false;
    const count = 1 + Math.floor((lvl - 1) / 3) + Math.floor(this.stats.proj / 2);
    const base = Math.atan2(t.y - this.player.y, t.x - this.player.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.5;
      const b = this.bullets.create(this.player.x, this.player.y, 'w_candycane');
      b.kind = 'cane'; b.dmg = 12 + 4 * (lvl - 1); b.t0 = this.runMs; b.phase = 'out'; b.hits = new Map(); b.expire = this.runMs + 4000;
      b.setScale(1.4).setDepth(this.player.y + 2); b.body.setSize(14, 14);
      b.setVelocity(Math.cos(a) * 340, Math.sin(a) * 340);
    }
    sfx('shoot');
    return true;
  }

  fire_iceblast(lvl) {
    const radius = 90 + 14 * lvl;
    const px = this.player.x, py = this.player.y;
    let any = false;
    for (const e of this.enemies.getChildren()) {
      if (!e.active || e.dead) continue;
      const d = Math.hypot(e.x - px, e.y - py);
      if (d < radius * 1.25) any = true;
    }
    if (!any) return false;
    const dmg = 10 + 4 * lvl;
    for (const e of this.enemies.getChildren().slice()) {
      if (!e.active || e.dead) continue;
      const d = Math.hypot(e.x - px, e.y - py);
      if (d > radius + 14) continue;
      e.slowUntil = this.runMs + 2000;
      if (lvl >= 3) this.knock(e, (e.x - px) / (d || 1), (e.y - py) / (d || 1), 220, 180);
      this.damageEnemy(e, this.dmgOf(dmg));
    }
    this.ring(px, py, radius, 0x7fd8ff);
    sfx('special');
    return true;
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
        onComplete: () => { bomb.destroy(); if (!this.ended) this.explode(tx, ty, 70 + 8 * lvl, this.dmgOf(25 + 8 * lvl)); }
      });
    }
    return true;
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
    const count = 2 + Math.floor((lvl - 1) / 2) + Math.floor(this.stats.proj / 2);
    while (this.bells.length < count) this.bells.push(this.add.image(0, 0, 'w_bells').setScale(1.8));
    while (this.bells.length > count) this.bells.pop().destroy();
    const radius = 66 + 5 * lvl;
    this.bellAngle += (2.6 + 0.2 * lvl) * dt * Math.min(1.8, 0.7 + 0.3 * this.stats.atk);
    const dmg = 7 + 2.5 * lvl;
    this.bells.forEach((b, i) => {
      const a = this.bellAngle + (i * Math.PI * 2) / count;
      b.setPosition(this.player.x + Math.cos(a) * radius, this.player.y + Math.sin(a) * radius).setDepth(this.player.y + 3).setAngle(Math.sin(this.runMs / 70 + i) * 18);
      for (const e of this.enemies.getChildren()) {
        if (!e.active || e.dead) continue;
        if (this.runMs < (e.bellUntil || 0)) continue;
        const reach = 20 + (e.boss ? 40 : 10);
        if (Math.abs(e.x - b.x) < reach && Math.abs(e.y - b.y) < reach) {
          e.bellUntil = this.runMs + 450;
          const d = Math.hypot(e.x - this.player.x, e.y - this.player.y) || 1;
          this.knock(e, (e.x - this.player.x) / d, (e.y - this.player.y) / d, 160, 120);
          this.damageEnemy(e, this.dmgOf(dmg));
        }
      }
    });
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
          b.setVelocity((dx / d) * 430, (dy / d) * 430);
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
      case 'antlercharge':
        this.dash = { until: this.runMs + 460, vx: f.x * 480, vy: f.y * 480, dmg: 60, hit: new Set(), knock: true };
        this.invulnUntil = Math.max(this.invulnUntil, this.runMs + 520);
        break;
      case 'blizzard': {
        const r = 300;
        for (const e of this.enemies.getChildren()) {
          if (!e.active || e.dead) continue;
          if (Math.hypot(e.x - px, e.y - py) > r) continue;
          e.frozenUntil = this.runMs + (e.boss ? 1500 : 3000);
          e.setTint(0x99ddff);
        }
        this.ring(px, py, r, 0x99ddff);
        break;
      }
      case 'icingshield':
        this.shield = Math.max(this.shield, 60);
        this.shieldUntil = this.runMs + 5000;
        this.popText(px, py - 30, 'SHIELD', '#7fd8ff');
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
    const w = this.run.wave;
    const opts = Object.values(ENEMIES).filter((d) => d.from <= w);
    const weights = opts.map((d) => d.weight + (w > d.from ? Math.min(3, (w - d.from) * 0.15) : 0));
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
    e.def = base; e.ai = base.ai === 'ghost' ? 'chase' : base.ai; e.boss = true; e.elite = false; e.bossDef = def;
    e.maxHp = e.hp = (500 + this.run.wave * 70) * def.hpMul * (1 + tier * 0.5);
    e.spd = def.speed; e.dmgVal = def.dmg * (1 + tier * 0.3);
    e.phase = 0; e.nextCharge = this.runMs + 3000; e.nextShot = this.runMs + 2500;
    e.frozenUntil = 0; e.slowUntil = 0; e.kUntil = 0; e.hitFlash = 0; e.charge = null;
    e.shots = def.shots + tier * 2;
    e.body.setSize(22, 24);
    e.setScale(def.scale); e.baseTint = def.tint; e.setTint(def.tint);
    this.boss = e;
    sfx('boss');
    bus.emit('boss', { name: def.name, hp: e.hp, max: e.maxHp });
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

      if (e.boss && this.runMs > e.nextShot) {
        e.nextShot = this.runMs + (e.hp < e.maxHp * 0.5 ? 2000 : 3000);
        const off = Math.random() * Math.PI;
        for (let s = 0; s < e.shots; s++) {
          const a = off + (s / e.shots) * Math.PI * 2;
          const b = this.eshots.create(e.x, e.y, 'ebullet');
          b.dmgVal = 8 + this.run.wave * 0.5; b.expire = this.runMs + 4000; b.body.setSize(8, 8);
          b.setDepth(e.y + 1).setVelocity(Math.cos(a) * 150, Math.sin(a) * 150);
        }
      }
    }
    if (this.boss && this.boss.active) this.bossBroadcast();
  }

  bossBroadcast() {
    this.bossAcc = (this.bossAcc || 0) + 1;
    if (this.bossAcc % 6 === 0) bus.emit('boss', { name: this.boss.bossDef.name, hp: Math.max(0, this.boss.hp), max: this.boss.maxHp });
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
    this.run.xp += n * this.stats.xpMult;
    while (this.run.xp >= xpNeeded(this.run.level)) {
      this.run.xp -= xpNeeded(this.run.level);
      this.run.level += 1;
      this.pendingLevels += 1;
    }
    if (this.pendingLevels > 0 && !this.paused && this.cards.length === 0) this.startLevelUp();
  }

  startLevelUp() {
    this.cards = rollUpgrades({ wave: this.run.wave, luck: this.stats.luck, weapons: this.weapons, available: this.available });
    this.freeze(true);
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * 0.1);
    sfx('level');
    bus.emit('levelup', { level: this.run.level - this.pendingLevels + 1, cards: this.cards });
  }

  chooseUpgrade(i) {
    if (!this.cards.length || !this.cards[i]) return;
    applyUpgrade(this.cards[i], this.stats, this.weapons);
    this.cards = [];
    this.pendingLevels -= 1;
    if (this.pendingLevels > 0) this.startLevelUp();
    else { this.freeze(false); bus.emit('levelup', null); }
  }

  spawnPresent(x, y) {
    if (this.presentList.length >= 6) return;
    const p = this.add.image(Phaser.Math.Clamp(x, 80, WORLD_W - 80), Phaser.Math.Clamp(y, 110, WORLD_H - 80), 'present').setScale(1.4);
    p.born = this.runMs; p.baseY = p.y;
    this.tweens.add({ targets: p, scale: 1.7, duration: 500, yoyo: true, repeat: -1 });
    this.presentList.push(p);
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
      if (this.runMs - p.born > 45000) { this.tweens.killTweensOf(p); p.destroy(); this.presentList.splice(i, 1); continue; }
      if (Math.hypot(this.player.x - p.x, this.player.y - p.y) < 30) {
        this.tweens.killTweensOf(p); p.destroy(); this.presentList.splice(i, 1);
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
      weapons: { ...this.weapons }, rage: this.runMs < this.rageUntil, time: Math.floor(this.runMs / 1000), force: !!force
    });
  }
}
