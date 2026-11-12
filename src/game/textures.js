// Procedurally generates every in-game texture so the project needs no image assets.
import { SPRITES, ICONS, drawSprite, skinPalette, PX } from './sprites.js';

const ENEMY_SPRITES = ['e_snowman', 'e_elf', 'e_gingerbread', 'e_reindeer', 'e_ghost'];

function mulberry(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function buildTextures(scene, character, skinId, arena) {
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
  make('lamp', 24, 60, (ctx) => {
    rect(ctx, '#2b2f3f', 10, 18, 4, 40); rect(ctx, '#2b2f3f', 6, 56, 12, 4);
    rect(ctx, '#2b2f3f', 6, 6, 12, 4); rect(ctx, '#ffe9a0', 8, 10, 8, 8); rect(ctx, '#ffffff', 10, 12, 4, 4); rect(ctx, '#2b2f3f', 8, 2, 8, 4);
    rect(ctx, '#d7263d', 4, 20, 4, 4); rect(ctx, '#35c27a', 16, 26, 4, 4); rect(ctx, '#d7263d', 4, 32, 4, 4);
  });
  make('snowpile', 48, 18, (ctx) => {
    rect(ctx, '#f6fbff', 6, 6, 36, 12); rect(ctx, '#ffffff', 12, 0, 24, 6); rect(ctx, '#d3e6f5', 6, 12, 36, 6); rect(ctx, '#f6fbff', 0, 12, 48, 6);
  });
  make('shadow', 30, 10, (ctx) => { ctx.fillStyle = 'rgba(30,50,90,0.28)'; ctx.fillRect(4, 0, 22, 10); ctx.fillRect(0, 2, 30, 6); });

  // ---- arena-specific ground + props ----
  const id = arena?.id;
  if (id === 'lake') {
    make('ground_lake', 96, 96, (ctx) => {
      const r = mulberry(11);
      rect(ctx, '#b9e0f3', 0, 0, 96, 96);
      for (let i = 0; i < 40; i++) rect(ctx, r() > 0.5 ? '#a5d2ea' : '#d6f0fb', Math.floor(r() * 24) * 4, Math.floor(r() * 24) * 4, 8, 4);
      for (let i = 0; i < 5; i++) { let x = Math.floor(r() * 20) * 4, y = Math.floor(r() * 20) * 4; for (let k = 0; k < 5; k++) { rect(ctx, '#7fb6d8', x, y, 4, 4); x += 4; y += r() > 0.5 ? 4 : 0; } }
    });
    make('crystal', 36, 66, (ctx) => {
      [[15, 0, 6, 6], [12, 6, 12, 6], [9, 12, 18, 12], [9, 24, 18, 18], [12, 42, 12, 12], [15, 54, 6, 6]].forEach(([x, y, w, h]) => { rect(ctx, '#8fdcff', x, y, w, h); rect(ctx, '#5ab6e8', x, y, Math.floor(w / 2), h); });
      rect(ctx, '#ffffff', 20, 12, 4, 20);
    });
    make('iceblock', 36, 30, (ctx) => { rect(ctx, '#7fc4e8', 0, 6, 36, 24); rect(ctx, '#bdeaff', 3, 0, 30, 9); rect(ctx, '#a8e4ff', 3, 9, 30, 15); rect(ctx, '#ffffff', 8, 4, 6, 3); rect(ctx, '#ffffff', 22, 13, 3, 6); });
  }
  if (id === 'candy') {
    make('ground_candy', 96, 96, (ctx) => {
      const r = mulberry(5);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) rect(ctx, (x + y) % 2 ? '#fde9f1' : '#f9d3e3', x * 16, y * 16, 16, 16);
      const cols = ['#e63946', '#35c27a', '#ffcf4a', '#6fb7ff'];
      for (let i = 0; i < 26; i++) rect(ctx, cols[Math.floor(r() * 4)], Math.floor(r() * 24) * 4, Math.floor(r() * 24) * 4, 4, 4);
    });
    const lolli = (key, c1, c2) => make(key, 30, 66, (ctx) => {
      rect(ctx, '#ffffff', 13, 30, 4, 36); rect(ctx, '#d3dbe6', 15, 30, 2, 36);
      rect(ctx, c1, 6, 0, 18, 30); rect(ctx, c1, 0, 6, 30, 18);
      rect(ctx, c2, 12, 6, 6, 18); rect(ctx, c2, 6, 12, 18, 6); rect(ctx, '#ffffff', 9, 3, 3, 3);
    });
    lolli('lolli', '#ff5fa2', '#ffffff'); lolli('lollipop', '#5ab0ff', '#fff3a8');
    make('gingerhouse', 60, 60, (ctx) => {
      rect(ctx, '#b5651d', 6, 24, 48, 36); rect(ctx, '#8a4b14', 6, 54, 48, 6);
      rect(ctx, '#ffffff', 0, 12, 60, 12); rect(ctx, '#ffffff', 6, 6, 48, 6); rect(ctx, '#ffffff', 15, 0, 30, 6);
      [[9, 15, '#e63946'], [27, 15, '#35c27a'], [45, 15, '#ffcf4a'], [18, 8, '#e63946'], [36, 8, '#6fb7ff']].forEach(([x, y, c]) => rect(ctx, c, x, y, 6, 6));
      rect(ctx, '#6b3a10', 24, 36, 12, 24); rect(ctx, '#ffe48a', 12, 33, 9, 9); rect(ctx, '#ffe48a', 39, 33, 9, 9); rect(ctx, '#ffffff', 12, 45, 36, 3);
    });
  }
  if (id === 'workshop') {
    make('ground_workshop', 96, 96, (ctx) => {
      const r = mulberry(3);
      rect(ctx, '#4a3220', 0, 0, 96, 96);
      for (let y = 0; y < 4; y++) { rect(ctx, '#2e1e12', 0, y * 24, 96, 3); for (let i = 0; i < 6; i++) rect(ctx, r() > 0.5 ? '#5a3d28' : '#3d291a', Math.floor(r() * 22) * 4, y * 24 + 6 + Math.floor(r() * 4) * 4, 12, 3); rect(ctx, '#2e1e12', (y % 2) * 48 + 24, y * 24, 3, 24); }
      [[4, 8], [40, 32], [76, 56], [20, 80]].forEach(([x, y]) => rect(ctx, '#7a6a55', x, y, 3, 3));
    });
    make('crate', 36, 36, (ctx) => { rect(ctx, '#5a3a1a', 0, 0, 36, 36); rect(ctx, '#8a5a2b', 3, 3, 30, 30); rect(ctx, '#6b4420', 3, 15, 30, 6); rect(ctx, '#6b4420', 15, 3, 6, 30); rect(ctx, '#a87a45', 6, 6, 6, 3); });
    make('toybox', 42, 36, (ctx) => { rect(ctx, '#d7263d', 3, 12, 36, 24); rect(ctx, '#ffcf4a', 0, 6, 42, 9); rect(ctx, '#35c27a', 9, 0, 12, 9); rect(ctx, '#6fb7ff', 24, 3, 9, 6); rect(ctx, '#ffffff', 15, 21, 12, 3); });
    make('candle', 18, 42, (ctx) => { rect(ctx, '#fff3d0', 6, 15, 6, 27); rect(ctx, '#d8c79a', 6, 15, 2, 27); rect(ctx, '#ffb000', 6, 6, 6, 9); rect(ctx, '#ffe9a0', 8, 8, 3, 5); rect(ctx, '#7a5a30', 3, 39, 12, 3); });
  }
}
