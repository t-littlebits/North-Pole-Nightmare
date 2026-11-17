import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/AppContext.jsx';
import { backend } from '../lib/backend/index.js';
import { CHARACTERS, CHARACTER_IDS, SKINS, WEAPONS, BOOSTS, RARITIES } from '../data/catalog.js';
import { ADVENT_REWARDS } from '../data/advent.js';
import { Hero, WeaponIcon } from '../components/Sprite.jsx';
import { TITLES, titleProgress } from '../data/titles.js';
import TitleTag from '../components/TitleTag.jsx';
import { MODS, MOD_LIST, MAX_SLOTS, MOD_CRATE_PRICE, PRESENT_MOD_RATE, canEquip, modFits } from '../data/mods.js';

const adventDay = {};
ADVENT_REWARDS.forEach((r) => r.grants.forEach((g) => { adventDay[`${g.type}:${g.id}`] = r.day; }));
const TABS = ['Heroes', 'Skins', 'Weapons', 'Mods', 'Boosts', 'Titles'];

export default function CollectionPage() {
  const { user, profile, owns, skinFor, act, setAuthOpen, titles, claims, inventory, showToast } = useApp();
  const [tab, setTab] = useState('Heroes');
  const needAuth = () => { if (!user) { setAuthOpen(true); return true; } return false; };
  const buy = (type, id, name) => { if (!needAuth()) act(() => backend.buy(type, id), `Unlocked ${name}!`); };
  const select = (args, msg) => { if (!needAuth()) act(() => backend.select(args), msg); };

  const total = CHARACTER_IDS.length + Object.keys(SKINS).length + Object.keys(WEAPONS).length;
  const have = CHARACTER_IDS.filter((c) => owns('character', c)).length + Object.keys(SKINS).filter((s) => owns('skin', s)).length + Object.keys(WEAPONS).filter((w) => owns('weapon', w)).length;
  const boosts = Object.entries(profile?.boosts || {}).filter(([, n]) => n > 0);
  const ownedMods = new Set(inventory.filter((i) => i.item_type === 'mod').map((i) => i.item_id));
  const loadout = profile?.loadout || {};
  const setSlots = (weapon, list, msg) => { if (!needAuth()) act(() => backend.equipLoadout(weapon, list), msg); };
  const openCrate = async () => {
    if (needAuth()) return;
    const r = await act(() => backend.buyModCrate());
    if (r?.mod) showToast(`Crate opened: ${MODS[r.mod].icon} ${MODS[r.mod].name}!`, 'ok');
  };
  const modSource = (id) => {
    const t = TITLES.find((x) => x.mod === id);
    if (t) return `Earn the title "${t.name}"`;
    const d = ADVENT_REWARDS.find((r) => r.grants.some((g) => g.type === 'mod' && g.id === id));
    return d ? `Advent calendar, day ${d.day} (also from presents and crates)` : 'Presents or Mod Crates';
  };
  const stats = {
    ...(profile || {}), advent_claims: claims.length,
    heroes_owned: CHARACTER_IDS.filter((c) => owns('character', c)).length, skins_owned: Object.keys(SKINS).filter((s) => owns('skin', s)).length
  };

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

      {tab === 'Mods' && (
        <>
          <p className="muted">Each weapon has {MAX_SLOTS} mod slots. Mods change how a weapon behaves (knockbacks, slows, bounces, echoes...) but never add damage, attack speed or XP. Earn most of them from titles. The rest come from the advent calendar, and those can also turn up in mystery presents (about {Math.round(PRESENT_MOD_RATE * 100)}% each, revealed after your run) or a crate. Mods that a title can award are never found by luck.</p>
          <div className="panel row">
            <button className="btn" onClick={openCrate}>Open a Mod Crate · 🪙 {MOD_CRATE_PRICE}</button>
            <span className="muted">A random mod you do not own yet.</span>
          </div>
          {Object.values(WEAPONS).filter((w) => owns('weapon', w.id)).map((w) => {
            const eq = loadout[w.id] || [];
            const avail = MOD_LIST.filter((m) => ownedMods.has(m.id) && canEquip(m.id, w.id) && !eq.includes(m.id));
            return (
              <div className="panel" key={w.id}>
                <div className="row"><WeaponIcon id={w.id} px={4} /><strong>{w.name}</strong></div>
                <div className="slots">
                  {Array.from({ length: MAX_SLOTS }, (_, i) => {
                    const id = eq[i];
                    return id
                      ? <button key={i} className="slot filled" title="Click to remove" onClick={() => setSlots(w.id, eq.filter((x) => x !== id), `${MODS[id].name} removed`)}>{MODS[id].icon} {MODS[id].name} ✕</button>
                      : <span key={i} className="slot">Empty slot</span>;
                  })}
                </div>
                <div className="chips">
                  {avail.map((m) => <button key={m.id} className="chip" disabled={eq.length >= MAX_SLOTS} title={m.desc} onClick={() => setSlots(w.id, [...eq, m.id], `${m.name} equipped`)}>{m.icon} {m.name}</button>)}
                  {!avail.length && <span className="muted small-text">No other mods to equip here yet.</span>}
                </div>
              </div>
            );
          })}
          <h3>All mods ({ownedMods.size}/{MOD_LIST.length} unlocked)</h3>
          <div className="grid items">
            {MOD_LIST.map((m) => {
              const has = ownedMods.has(m.id);
              return (
                <div key={m.id} className={`panel item ${has ? '' : 'locked'}`}>
                  <span className="emoji big">{m.icon}</span>
                  <strong>{m.name}</strong>
                  <span className="small-text" style={{ color: RARITIES[m.rarity].color }}>{RARITIES[m.rarity].name}</span>
                  <span className="small-text">{m.desc}</span>
                  <span className="muted small-text">Fits: {modFits(m.id)}</span>
                  {has ? <span className="ok">Unlocked</span> : <span className="muted small-text">{modSource(m.id)}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'Titles' && (
        <>
          <p className="muted">Titles show next to your name on the leaderboard and your profile.{profile?.equipped_title && <> Equipped: <TitleTag id={profile.equipped_title} /></>}</p>
          <div className="grid items">
            {TITLES.filter((t) => !t.manual || titles.includes(t.id)).map((t) => {
              const has = titles.includes(t.id), equipped = profile?.equipped_title === t.id;
              const [cur, target] = titleProgress(t, stats);
              return (
                <div key={t.id} className={`panel item ${has ? '' : 'locked'}`}>
                  <TitleTag id={t.id} />
                  <span className="small-text">{t.desc}</span>
                  {t.mod && <span className="small-text gold">Reward: {MODS[t.mod].icon} {MODS[t.mod].name} mod</span>}
                  {has ? <button className="btn small" onClick={() => act(() => backend.equipTitle(equipped ? null : t.id), equipped ? 'Title removed' : 'Title equipped')}>{equipped ? 'Remove' : 'Equip'}</button>
                    : <div className="progress" aria-label={`${cur} of ${target}`}><i style={{ width: `${(cur / target) * 100}%` }} /><span>{cur.toLocaleString()} / {target.toLocaleString()}</span></div>}
                </div>
              );
            })}
          </div>
        </>
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
