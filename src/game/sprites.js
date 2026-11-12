// Pixel-art sprites defined as palette-indexed strings (12x12), rendered with
// nearest-neighbour scaling. Used by Phaser (textures) AND React (previews).
import { SKINS, defaultSkinFor } from '../data/catalog.js';

export const PX = 3; // screen pixels per sprite pixel in-game

const SANTA = [
  '....RRRR....', '...RRRRRR..W', '..WWWWWWWW..', '..WSKSSKSW..', '..WSSSSSSW..', '..WWWWWWWW..',
  '.RRWWWWWWRR.', '.RRRRKKRRRR.', '.SRRRYYRRRS.', '..RRRRRRRR..', '..RRR..RRR..', '..BBB..BBB..'
];
const ELF = [
  '.....GG.....', '....GGGG....', '...GGGGGG...', '..RRRRRRRR..', '.SSSSSSSSSS.', '..SKSSSSKS..',
  '..SSSRRSSS..', '..GGGGGGGG..', '.SGGGYYGGGS.', '..GGGGGGGG..', '..GG....GG..', '..BB....BB..'
];
const SNOWMAN = [
  '...KKKKKK...', '...KKKKKK...', '.KKKKKKKKKK.', '...WWWWWW...', '..WWKWWKWW..', '..WWWOOWWW..',
  '...RRRRRR...', '.WWWWWWWWWW.', 'WWWWKWWKWWWW', '.WWWWWWWWWW.', '..WWWWWWWW..', '...WWWWWW...'
];
const REINDEER = [
  '.A..A..A..A.', '.AA.A..A.AA.', '..AANNNNAA..', '...NNNNNN...', '..NNKNNKNN..', '..NNNNNNNN..',
  '...NNRRNN...', '..NNNNNNNN..', '.NNNTTTTNNN.', '.NNNTTTTNNN.', '..NN....NN..', '..DD....DD..'
];
const KNIGHT = [
  '....SSSS....', '...SSSSSS...', '...SKKKKS...', '...BBBBBB...', '..BBIBBIBB..', '..BBBIIBBB..',
  '.SSBBBBBBSS.', 'SBBBBRRBBBBS', '.IBBBBBBBBI.', '..BBBBBBBB..', '..BBB..BBB..', '..III..III..'
];
const E_SNOWMAN = [
  '....WWWW....', '...WWWWWW...', '..WWRWWRWW..', '..WWWOOWWW..', '..WWKWKWKW..', '...WWWWWW...',
  '.WWWWWWWWWW.', 'KWWWIWWIWWWK', '.WWWWWWWWWW.', '..WWWWWWWW..', '..IWWWWWWI..', '...IIIIII...'
];
const E_GINGER = [
  '..BB....BB..', '.BBBB..BBBB.', '.BBBBBBBBBB.', '..BKBBBBKB..', '..BBBBBBBB..', '..BIKIKIKI..',
  '..BBBBBBBB..', 'BBBBBRRBBBBB', 'BB.BBBBBB.BB', '...BBBBBB...', '...BB..BB...', '..III..III..'
];
const E_ELF = [
  '.......RRY..', '....RRRRRR..', '...RRRRRRR..', '..RRRRRRRR..', '..WWWWWWWW..', '.SSESSSSESS.',
  '.SSSSSSSSSS.', '..SSFSSFSS..', '..GGGGGGGG.L', '.SGGGBBGGGSL', '..GG....GG.H', '..BB....BB..'
];
const GHOST = [
  '....RRRR....', '...RRRRRR.W.', '..WWWWWWWW..', '.WWWWWWWWWW.', '.WWKKWWKKWW.', '.WWKKWWKKWW.',
  '.WWWWKKWWWW.', '.WWWWKKWWWW.', '.WWWWWWWWWW.', '.WWWWWWWWWW.', '.WW.WWWW.WW.', '..W..WW..W..'
];

export const SPRITES = {
  santa: { rows: SANTA, pal: { R: '#d7263d', W: '#ffffff', S: '#f2c9a0', K: '#1b1b2f', Y: '#ffd166', B: '#3b2a20' } },
  elf: { rows: ELF, pal: { G: '#2f9e5b', R: '#d7263d', S: '#f2c9a0', K: '#1b1b2f', Y: '#ffd166', B: '#6b4226' } },
  snowman: { rows: SNOWMAN, pal: { K: '#1b1b2f', W: '#f3fbff', O: '#ff8c1a', R: '#d7263d' } },
  reindeer: { rows: REINDEER, pal: { N: '#9b5a2f', D: '#5a3218', T: '#d9a066', A: '#e8c07a', K: '#1b1b2f', R: '#ff3b3b' } },
  knight: { rows: KNIGHT, pal: { B: '#b5651d', I: '#ffffff', S: '#aab4c4', K: '#1b1b2f', R: '#d7263d' } },
  // enemies
  e_snowman: { rows: E_SNOWMAN, pal: { W: '#dff3ff', I: '#8fb8d8', K: '#1b1b2f', R: '#ff2a2a', O: '#ff8c1a' } },
  e_elf: { rows: E_ELF, pal: { R: '#b3122e', Y: '#ffcf4a', W: '#ffffff', S: '#e8b896', E: '#ff2a2a', F: '#ffffff', G: '#1f6f4a', B: '#3b2a20', L: '#d6dde8', H: '#7a4a1a' } },
  e_gingerbread: { rows: E_GINGER, pal: { B: '#8a4b14', I: '#f3f3f3', K: '#1b1b2f', R: '#ff2a2a' } },
  e_reindeer: { rows: REINDEER, pal: { N: '#4a2f2a', D: '#1d1210', T: '#7a4a3a', A: '#e8e0c8', K: '#ff2a2a', R: '#ff0000' } },
  e_ghost: { rows: GHOST, pal: { W: '#cfe9ff', K: '#12202e', R: '#d7263d' } }
};

export const skinPalette = (spriteId, skinId) => {
  const base = SPRITES[spriteId].pal;
  const skin = skinId && SKINS[skinId];
  return skin && skin.character === spriteId ? { ...base, ...skin.palette } : base;
};

export function drawSprite(ctx, rows, pal, px, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (c) { ctx.fillStyle = c; ctx.fillRect(ox + x * px, oy + y * px, px, px); }
    }
  });
}

const urlCache = new Map();
/** PNG data URL of a sprite for use in <img> (React pages). */
export function spriteURL(spriteId, skinId, px = 6) {
  const key = `${spriteId}|${skinId || ''}|${px}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const s = SPRITES[spriteId];
  const c = document.createElement('canvas');
  c.width = c.height = 12 * px;
  drawSprite(c.getContext('2d'), s.rows, skinPalette(spriteId, skinId), px);
  const url = c.toDataURL();
  urlCache.set(key, url);
  return url;
}
export const characterURL = (character, skinId, px = 6) => spriteURL(character, skinId || defaultSkinFor(character), px);

// ---- small item icons (strings, 8x8) ----
export const ICONS = {
  snowball: { rows: ['..WWWW..', '.WWWWIW.', 'WWWWWWIW', 'WWWWWWWI', 'WWWWWWWI', 'WWWWWWII', '.WWWWII.', '..IIII..'], pal: { W: '#ffffff', I: '#9fd3ff' } },
  candycane: { rows: ['..RRRR..', '.RWRWWR.', '.RW..RW.', '.....WR.', '....RW..', '....WR..', '....RW..', '....WR..'], pal: { R: '#d7263d', W: '#ffffff' } },
  iceblast: { rows: ['...CC...', '.C.CC.C.', '..CCCC..', 'CCCWWCCC', 'CCCWWCCC', '..CCCC..', '.C.CC.C.', '...CC...'], pal: { C: '#7fd8ff', W: '#ffffff' } },
  bells: { rows: ['...YY...', '..YYYY..', '.YYWYYY.', '.YYWYYY.', '.YYYYYY.', 'YYYYYYYY', 'YYYYYYYY', '...KK...'], pal: { Y: '#ffcf4a', W: '#fff7c2', K: '#8a5a00' } },
  bomb: { rows: ['.....Y..', '....K...', '..BBBB..', '.BBIBBB.', 'BBBBBBBB', 'BBIBBIBB', '.BBBBBB.', '..BBBB..'], pal: { B: '#b5651d', I: '#ffffff', K: '#5a3218', Y: '#ffcf4a' } }
};
const iconCache = new Map();
export function iconURL(id, px = 4) {
  const k = `${id}|${px}`;
  if (iconCache.has(k)) return iconCache.get(k);
  const ic = ICONS[id];
  const c = document.createElement('canvas');
  c.width = c.height = 8 * px;
  drawSprite(c.getContext('2d'), ic.rows, ic.pal, px);
  const url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}
