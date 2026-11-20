import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/AppContext.jsx';
import { backend } from '../lib/backend/index.js';
import { CHARACTERS, CHARACTER_IDS, SKINS, WEAPONS, BOOSTS, RARITIES } from '../data/catalog.js';
import { ADVENT_REWARDS } from '../data/advent.js';
import { Hero, WeaponIcon } from '../components/Sprite.jsx';
import { TITLES, titleProgress } from '../data/titles.js';
import { COSMETIC_LIST, COSMETIC_SLOTS, SLOT_NAMES } from '../data/cosmetics.js';
import { isSkinVisible } from '../data/catalog.js';
import TitleTag from '../components/TitleTag.jsx';
import ActionButton from '../components/ActionButton.jsx';
import { optimistic } from '../lib/optimistic.js';
import { affordable, isLit } from '../lib/shop.js';
import { MODS, MOD_LIST, MAX_SLOTS, MOD_CRATE_PRICE, PRESENT_MOD_RATE, canEquip, modFits } from '../data/mods.js';

const adventDay = {};
ADVENT_REWARDS.forEach((r) => r.grants.forEach((g) => { adventDay[`${g.type}:${g.id}`] = r.day; }));
const TABS = ['Heroes', 'Skins', 'Effects', 'Weapons', 'Mods', 'Boosts', 'Titles'];

export default function CollectionPage() {
  const { user, profile, owns, skinFor, act, setAuthOpen, titles, claims, inventory, showToast, isPending } = useApp();
  const [tab, setTab] = useState('Heroes');
  const needAuth = () => { if (!user) { setAuthOpen(true); return true; } return false; };
  // Everything below updates the screen immediately and confirms with the server in the background (see lib/actionRunner.js).
  const coins = profile?.coins ?? 0;
  const canAfford = (price) => affordable(!!user, coins, price);
  const lit = (has, price) => isLit(has, !!user, coins, price);   // owned, or not owned yet but affordable: both are lit up
  const itemKey = (type, id) => `item:${type}:${id}`;
  const saving = (type, id) => (isPending(itemKey(type, id)) ? 'saving' : '');
  const buy = (type, id, name, price) => { if (!needAuth()) act(() => backend.buy(type, id), `Unlocked ${name}!`, { key: itemKey(type, id), optimistic: optimistic.buy(type, id, price) }); };
  const select = (args, msg, key) => { if (!needAuth()) act(() => backend.select(args), msg, { key, optimistic: optimistic.select(args.character, args.skin) }); };
  const equipCosmetic = (slot, c, equipped) => { if (!needAuth()) act(() => backend.equipCosmetic(slot, equipped ? null : c.id), equipped ? `${c.name} removed` : `${c.name} equipped`, { key: itemKey('cosmetic', c.id), optimistic: optimistic.cosmetic(slot, equipped ? null : c.id) }); };
  const equipTitle = (t, equipped) => act(() => backend.equipTitle(equipped ? null : t.id), equipped ? 'Title removed' : 'Title equipped', { key: itemKey('title', t.id), optimistic: optimistic.title(equipped ? null : t.id) });
  const BuyButton = ({ type, id, name, price }) => (
    <ActionButton pending={isPending(itemKey(type, id))} pendingLabel="Buying…" disabled={!!user && !canAfford(price)} title={user && !canAfford(price) ? 'Not enough coins yet' : undefined} onClick={() => buy(type, id, name, price)}>Buy</ActionButton>
  );

  const shownSkins = Object.values(SKINS).filter((s) => isSkinVisible(s, owns('skin', s.id)));   // secret skins stay hidden until you own them
  const total = CHARACTER_IDS.length + shownSkins.length + Object.keys(WEAPONS).length;
  const have = CHARACTER_IDS.filter((c) => owns('character', c)).length + shownSkins.filter((s) => owns('skin', s.id)).length + Object.keys(WEAPONS).filter((w) => owns('weapon', w)).length;
  const boosts = Object.entries(profile?.boosts || {}).filter(([, n]) => n > 0);
  const ownedMods = new Set(inventory.filter((i) => i.item_type === 'mod').map((i) => i.item_id));
  const loadout = profile?.loadout || {};
  const setSlots = (weapon, list, msg) => { if (!needAuth()) act(() => backend.equipLoadout(weapon, list), msg, { key: `loadout:${weapon}`, optimistic: optimistic.loadout(weapon, list) }); };
  const openCrate = async () => {
    if (needAuth()) return;
    const r = await act(() => backend.buyModCrate(), null, { key: 'crate' });
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
              <div key={id} className={`panel item ${has ? '' : 'locked'} ${saving('character', id)}`}>
                <Hero character={id} skin={skinFor(id)} px={8} />
                <strong>{c.name}</strong>
                <span className="muted small-text">HP {c.hp} · Speed {c.speed}</span>
                <span className="small-text">{c.ability.name}: {c.ability.desc}</span>
                {has ? <ActionButton pending={isPending(itemKey('character', id))} pendingLabel="Saving…" disabled={sel} onClick={() => select({ character: id }, `${c.name} selected`, itemKey('character', id))}>{sel ? 'Selected' : 'Select'}</ActionButton>
                  : <><Source type="character" id={id} price={c.price} buyable /><BuyButton type="character" id={id} name={c.name} price={c.price} /></>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'Skins' && CHARACTER_IDS.map((cid) => (
        <section key={cid}>
          <h3>{CHARACTERS[cid].name}</h3>
          <div className="grid items">
            {shownSkins.filter((s) => s.character === cid).map((s) => {
              const has = owns('skin', s.id), equipped = skinFor(cid) === s.id;
              return (
                <div key={s.id} className={`panel item ${lit(has, s.source === 'shop' ? s.price : Infinity) ? '' : 'locked'} ${saving('skin', s.id)}`} style={{ outlineColor: RARITIES[s.rarity].color }}>
                  <Hero character={cid} skin={s.id} px={7} />
                  <strong>{s.name}</strong>
                  <span className="small-text" style={{ color: RARITIES[s.rarity].color }}>{RARITIES[s.rarity].name}{s.source === 'advent' ? ' · exclusive' : ''}</span>
                  {has ? <ActionButton pending={isPending(itemKey('skin', s.id))} pendingLabel="Saving…" disabled={equipped || !owns('character', cid)} onClick={() => select({ character: cid, skin: s.id }, `${s.name} equipped`, itemKey('skin', s.id))}>{equipped ? 'Equipped' : owns('character', cid) ? 'Equip' : 'Unlock hero first'}</ActionButton>
                    : s.source === 'shop' ? <><Price price={s.price} /><BuyButton type="skin" id={s.id} name={s.name} price={s.price} /></>
                      : <Source type="skin" id={s.id} />}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {tab === 'Effects' && (
        <>
          <p className="muted">Effects are purely cosmetic: they add no power. Buy them with coins and equip one in each slot. They show during your runs.</p>
          {COSMETIC_SLOTS.map((slot) => (
            <section key={slot}>
              <h3>{SLOT_NAMES[slot]}</h3>
              <div className="grid items">
                {COSMETIC_LIST.filter((c) => c.slot === slot).map((c) => {
                  const has = owns('cosmetic', c.id), eq = profile?.cosmetics?.[slot] === c.id;
                  return (
                    <div key={c.id} className={`panel item ${lit(has, c.price) ? '' : 'locked'} ${saving('cosmetic', c.id)}`}>
                      <span className="emoji big">{c.icon}</span>
                      <strong>{c.name}</strong>
                      <span className="small-text" style={{ color: RARITIES[c.rarity].color }}>{RARITIES[c.rarity].name}</span>
                      <span className="small-text">{c.desc}</span>
                      {has ? <ActionButton pending={isPending(itemKey('cosmetic', c.id))} pendingLabel="Saving…" onClick={() => equipCosmetic(slot, c, eq)}>{eq ? 'Remove' : 'Equip'}</ActionButton>
                        : <><Price price={c.price} /><BuyButton type="cosmetic" id={c.id} name={c.name} price={c.price} /></>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

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
                  : <><Source type="weapon" id={w.id} price={w.price} buyable /><BuyButton type="weapon" id={w.id} name={w.name} price={w.price} /></>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'Mods' && (
        <>
          <p className="muted">Each weapon has {MAX_SLOTS} mod slots. Mods change how a weapon behaves (knockbacks, slows, bounces, echoes...) but never add damage, attack speed or XP. Earn most of them from titles. The rest come from the advent calendar, and those can also turn up in mystery presents (about {Math.round(PRESENT_MOD_RATE * 100)}% each, revealed after your run) or a crate. Mods that a title can award are never found by luck.</p>
          <div className="panel row">
            <ActionButton className="btn" pending={isPending('crate')} pendingLabel="Opening crate…" disabled={!!user && coins < MOD_CRATE_PRICE} title={user && coins < MOD_CRATE_PRICE ? 'Not enough coins yet' : undefined} onClick={openCrate}>Open a Mod Crate · 🪙 {MOD_CRATE_PRICE}</ActionButton>
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
                      ? <button key={i} className="slot filled" title="Click to remove" disabled={isPending(`loadout:${w.id}`)} onClick={() => setSlots(w.id, eq.filter((x) => x !== id), `${MODS[id].name} removed`)}>{MODS[id].icon} {MODS[id].name} ✕</button>
                      : <span key={i} className="slot">Empty slot</span>;
                  })}
                </div>
                <div className="chips">
                  {avail.map((m) => <button key={m.id} className="chip" disabled={eq.length >= MAX_SLOTS || isPending(`loadout:${w.id}`)} title={m.desc} onClick={() => setSlots(w.id, [...eq, m.id], `${m.name} equipped`)}>{m.icon} {m.name}</button>)}
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
                <div key={t.id} className={`panel item ${has ? '' : 'locked'} ${saving('title', t.id)}`}>
                  <TitleTag id={t.id} />
                  <span className="small-text">{t.desc}</span>
                  {t.mod && <span className="small-text gold">Reward: {MODS[t.mod].icon} {MODS[t.mod].name} mod</span>}
                  {has ? <ActionButton pending={isPending(itemKey('title', t.id))} pendingLabel="Saving…" onClick={() => equipTitle(t, equipped)}>{equipped ? 'Remove' : 'Equip'}</ActionButton>
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
