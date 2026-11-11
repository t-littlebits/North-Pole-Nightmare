import { characterURL, spriteURL, iconURL } from '../game/sprites.js';

export function Hero({ character, skin, px = 6, className = '', title }) {
  return <img className={`pix ${className}`} src={characterURL(character, skin, px)} alt={title || character} width={12 * px} height={12 * px} draggable="false" />;
}
export function Enemy({ id, px = 6, className = '' }) {
  return <img className={`pix ${className}`} src={spriteURL(id, null, px)} alt="" width={12 * px} height={12 * px} draggable="false" />;
}
export function WeaponIcon({ id, px = 4, className = '' }) {
  return <img className={`pix ${className}`} src={iconURL(id, px)} alt="" width={8 * px} height={8 * px} draggable="false" />;
}
