import { TITLE_BY_ID } from '../data/titles.js';

/** Small coloured badge for a title id; renders nothing for unknown/empty ids. */
export default function TitleTag({ id, className = '' }) {
  const t = id && TITLE_BY_ID[id];
  if (!t) return null;
  return <span className={`title-tag t-${t.rarity} ${className}`} title={t.desc}>{t.name}</span>;
}
