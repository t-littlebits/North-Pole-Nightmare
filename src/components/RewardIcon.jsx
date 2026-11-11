import { CHARACTERS, SKINS, WEAPONS, BOOSTS } from '../data/catalog.js';
import { Hero, WeaponIcon } from './Sprite.jsx';

export function RewardIcon({ grant, px = 6 }) {
  if (grant.type === 'skin') return <Hero character={SKINS[grant.id].character} skin={grant.id} px={px} />;
  if (grant.type === 'character') return <Hero character={grant.id} px={px} />;
  if (grant.type === 'weapon') return <WeaponIcon id={grant.id} px={px} />;
  if (grant.type === 'boost') return <span className="emoji" style={{ fontSize: px * 8 }}>{BOOSTS[grant.id].icon}</span>;
  return <span className="emoji" style={{ fontSize: px * 8 }}>🪙</span>;
}

export function grantLabel(g) {
  if (g.type === 'coins') return `${g.amount} coins`;
  if (g.type === 'skin') return `${SKINS[g.id].name} skin`;
  if (g.type === 'weapon') return `${WEAPONS[g.id].name} weapon`;
  if (g.type === 'character') return `${CHARACTERS[g.id].name} hero`;
  return `${BOOSTS[g.id].name} ×${g.amount || 1}`;
}
