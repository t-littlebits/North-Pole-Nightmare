// Procedurally generates every in-game texture so the project needs no image assets.
import { SPRITES, ICONS, drawSprite, skinPalette, PX } from './sprites.js';

const ENEMY_SPRITES = ['e_snowman', 'e_elf', 'e_gingerbread', 'e_reindeer', 'e_ghost'];

function mulberry(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildTextures(scene, character, skinId) {
  const tm = scene.textures;
  const make = (key, w, h, fn) => {
    if (tm.exists(key)) return;
    const t = tm.createCanvas(key, w, h);
    fn(t.getContext());
    t.refresh();
  };
  const rect = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  make(`player_${character}_${skinId}`, 12 * PX, 12 * PX, (ctx) => drawSprite(ctx, SPRITES[character].rows, skinPalette(character, skinId), PX));
  ENEMY_SPRITES.forEach((id) => make(id, 12 * PX, 12 * PX, (ctx) => drawSprite(ctx, SPRITES[id].rows, SPRITES[id].pal, PX)));

  ['snowball', 'candycane', 'bells', 'bomb'].forEach((id) => make(`w_${id}`, 16, 16, (ctx) => drawSprite(ctx, ICONS[id].rows, ICONS[id].pal, 2)));

  make('ebullet', 12, 12, (ctx) => { rect(ctx, '#5a0010', 2, 0, 8, 12); rect(ctx, '#5a0010', 0, 2, 12, 8); rect(ctx, '#ff2a4a', 2, 2, 8, 8); rect(ctx, '#ffd0d8', 4, 4, 4, 4); });
  make('flake', 4, 4, (ctx) => { rect(ctx, '#ffffff', 0, 0, 4, 4); });
  make('spark', 6, 6, (ctx) => { rect(ctx, '#fff6b0', 2, 0, 2, 6); rect(ctx, '#fff6b0', 0, 2, 6, 2); });
  make('bit', 4, 4, (ctx) => { rect(ctx, '#ffffff', 0, 0, 4, 4); });

  const gem = (key, c1, c2) => make(key, 12, 12, (ctx) => {
    rect(ctx, c2, 4, 0, 4, 12); rect(ctx, c2, 2, 2, 8, 8); rect(ctx, c2, 0, 4, 12, 4);
    rect(ctx, c1, 4, 2, 4, 8); rect(ctx, c1, 2, 4, 8, 4); rect(ctx, '#ffffff', 4, 3, 2, 2);
  });
  gem('gem_s', '#5bff8a', '#1f9d4d'); gem('gem_m', '#5bc8ff', '#1f6fb0'); gem('gem_l', '#d79bff', '#7a2fc0');

  make('present', 20, 16, (ctx) => {
    const rows = ['...YYYY...', '..Y.YY.Y..', 'RRRRYYRRRR', 'RRRRYYRRRR', 'YYYYYYYYYY', 'RRRRYYRRRR', 'RRRRYYRRRR', 'DDDDYYDDDD'];
    drawSprite(ctx, rows, { R: '#d7263d', D: '#9a1426', Y: '#ffcf4a' }, 2);
  });

  make('ground', 96, 96, (ctx) => {
    const r = mulberry(7);
    rect(ctx, '#e6f2fb', 0, 0, 96, 96);
    for (let i = 0; i < 90; i++) rect(ctx, r() > 0.5 ? '#d3e6f5' : '#f6fbff', Math.floor(r() * 24) * 4, Math.floor(r() * 24) * 4, 4 + (r() > 0.6 ? 4 : 0), 4);
    for (let i = 0; i < 7; i++) rect(ctx, '#bcd8ee', Math.floor(r() * 24) * 4, Math.floor(r() * 24) * 4, 4, 4);
  });

  make('tree', 48, 78, (ctx) => {
    const p = 3;
    const tier = (y0, h, hw, c1, c2) => {
      for (let i = 0; i < h; i++) {
        const w = Math.max(1, Math.round((hw * (i + 1)) / h));
        rect(ctx, c1, (8 - w) * p, (y0 + i) * p, w * 2 * p, p);
        rect(ctx, c2, (8 - w) * p, (y0 + i) * p, p, p);
        rect(ctx, c2, (8 + w - 1) * p, (y0 + i) * p, p, p);
      }
      rect(ctx, '#ffffff', 6 * p, y0 * p, 4 * p, p); // snow cap
    };
    rect(ctx, '#6b4226', 7 * p, 22 * p, 2 * p, 4 * p);
    tier(10, 8, 7, '#1f6f4a', '#14452f'); tier(5, 7, 5, '#2a8a5a', '#14452f'); tier(1, 6, 3, '#35a36b', '#14452f');
    rect(ctx, '#ffcf4a', 7 * p, 0, 2 * p, p);
    [[6, 8, '#e63946'], [10, 11, '#ffcf4a'], [5, 14, '#7fd8ff'], [11, 16, '#e63946'], [8, 5, '#ffcf4a'], [7, 19, '#7fd8ff'], [3, 17, '#ffcf4a'], [13, 18, '#e63946']]
      .forEach(([x, y, c]) => rect(ctx, c, x * p, y * p, p, p));
  });
  make('cane_post', 18, 54, (ctx) => {
    for (let y = 0; y < 14; y++) rect(ctx, y % 2 ? '#ffffff' : '#d7263d', 6, 12 + y * 3, 6, 3);
    rect(ctx, '#d7263d', 6, 6, 12, 6); rect(ctx, '#ffffff', 12, 6, 6, 3); rect(ctx, '#d7263d', 12, 12, 6, 6);
  });
  make('snowpile', 48, 18, (ctx) => {
    rect(ctx, '#f6fbff', 6, 6, 36, 12); rect(ctx, '#ffffff', 12, 0, 24, 6); rect(ctx, '#d3e6f5', 6, 12, 36, 6); rect(ctx, '#f6fbff', 0, 12, 48, 6);
  });
  make('shadow', 30, 10, (ctx) => { ctx.fillStyle = 'rgba(30,50,90,0.28)'; ctx.fillRect(4, 0, 22, 10); ctx.fillRect(0, 2, 30, 6); });
}
