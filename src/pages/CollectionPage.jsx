import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/AppContext.jsx';
import { backend } from '../lib/backend/index.js';
import { CHARACTERS, CHARACTER_IDS, SKINS, WEAPONS, BOOSTS, RARITIES } from '../data/catalog.js';
import { ADVENT_REWARDS } from '../data/advent.js';
import { Hero, WeaponIcon } from '../components/Sprite.jsx';

const adventDay = {};
ADVENT_REWARDS.forEach((r) => r.grants.forEach((g) => { adventDay[`${g.type}:${g.id}`] = r.day; }));
const TABS = ['Heroes', 'Skins', 'Weapons', 'Boosts'];

export default function CollectionPage() {
  const { user, profile, owns, skinFor, act, setAuthOpen } = useApp();
  const [tab, setTab] = useState('Heroes');
  const needAuth = () => { if (!user) { setAuthOpen(true); return true; } return false; };
  const buy = (type, id, name) => { if (!needAuth()) act(() => backend.buy(type, id), `Unlocked ${name}!`); };
  const select = (args, msg) => { if (!needAuth()) act(() => backend.select(args), msg); };

  const total = CHARACTER_IDS.length + Object.keys(SKINS).length + Object.keys(WEAPONS).length;
  const have = CHARACTER_IDS.filter((c) => owns('character', c)).length + Object.keys(SKINS).filter((s) => owns('skin', s)).length + Object.keys(WEAPONS).filter((w) => owns('weapon', w)).length;
  const boosts = Object.entries(profile?.boosts || {}).filter(([, n]) => n > 0);

  const Price = ({ price }) => <span className="gold">🪙 {price}</span>;
  const Source = ({ type, id, price, buyable }) => (buyable && price > 0 ? <Price price={price} /> : adventDay[`${type}:${id}`] ? <span className="muted">Advent day {adventDay[`${type}:${id}`]}</span> : null);

  return (
    <div className="page">
      <h1>Collection</h1>
      <p className="muted">{have} of {total} items unlocked{user ? <> · you have <b className="gold">🪙 {profile?.coins ?? 0}</b></> : <> · <button className="linkbtn" onClick={() => setAuthOpen(true)}>sign in</button> to unlock and equip items</>}</p>
      <div className="tabs" role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>

      {tab === 'Heroes' && (
        <div className="grid items">
          {CHARACTER_IDS.map((id) => {
            const c = CHARACTERS[id], has = owns('character', id), sel = profile?.selected_character === id;
            return (
              <div key={id} className={`panel item ${has ? '' : 'locked'}`}>
                <Hero character={id} skin={skinFor(id)} px={8} />
                <strong>{c.name}</strong>
                <span className="muted small-text">HP {c.hp} · Speed {c.speed}</span>
                <span className="small-text">{c.ability.name}: {c.ability.desc}</span>
                {has ? <button className="btn small" disabled={sel} onClick={() => select({ character: id }, `${c.name} selected`)}>{sel ? 'Selected' : 'Select'}</button>
                  : <><Source type="character" id={id} price={c.price} buyable /><button className="btn small" onClick={() => buy('character', id, c.name)}>Buy</button></>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'Skins' && CHARACTER_IDS.map((cid) => (
        <section key={cid}>
          <h3>{CHARACTERS[cid].name}</h3>
          <div className="grid items">
            {Object.values(SKINS).filter((s) => s.character === cid).map((s) => {
              const has = owns('skin', s.id), equipped = skinFor(cid) === s.id;
              return (
                <div key={s.id} className={`panel item ${has ? '' : 'locked'}`} style={{ outlineColor: RARITIES[s.rarity].color }}>
                  <Hero character={cid} skin={s.id} px={7} />
                  <strong>{s.name}</strong>
                  <span className="small-text" style={{ color: RARITIES[s.rarity].color }}>{RARITIES[s.rarity].name}{s.source === 'advent' ? ' · exclusive' : ''}</span>
                  {has ? <button className="btn small" disabled={equipped || !owns('character', cid)} onClick={() => select({ character: cid, skin: s.id }, `${s.name} equipped`)}>{equipped ? 'Equipped' : owns('character', cid) ? 'Equip' : 'Unlock hero first'}</button>
                    : s.source === 'shop' ? <><Price price={s.price} /><button className="btn small" onClick={() => buy('skin', s.id, s.name)}>Buy</button></>
                      : <Source type="skin" id={s.id} />}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {tab === 'Weapons' && (
        <div className="grid items">
          {Object.values(WEAPONS).map((w) => {
            const has = owns('weapon', w.id);
            return (
              <div key={w.id} className={`panel item ${has ? '' : 'locked'}`}>
                <WeaponIcon id={w.id} px={8} />
                <strong>{w.name}</strong>
                <span className="small-text">{w.blurb}</span>
                {has ? <span className="ok">Unlocked: can appear as an upgrade</span>
                  : <><Source type="weapon" id={w.id} price={w.price} buyable /><button className="btn small" onClick={() => buy('weapon', w.id, w.name)}>Buy</button></>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'Boosts' && (
        <div className="grid items">
          {Object.values(BOOSTS).map((b) => {
            const n = profile?.boosts?.[b.id] || 0;
            return (
              <div key={b.id} className={`panel item ${n ? '' : 'locked'}`}>
                <span className="emoji big">{b.icon}</span>
                <strong>{b.name} ×{n}</strong>
                <span className="small-text">{b.desc}</span>
                <span className="muted small-text">Earned from the Advent calendar. Pick one before a run.</span>
              </div>
            );
          })}
          {!boosts.length && <p className="muted">No boosts yet. <Link to="/advent" className="link">Open some advent doors</Link>.</p>}
        </div>
      )}
    </div>
  );
}
