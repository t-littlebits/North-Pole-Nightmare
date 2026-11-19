# North Pole Nightmare

A pixel-art Christmas survival arena. React + Vite site, Phaser 3 game, Supabase accounts/leaderboard, Netlify hosting and functions.

**No keys? No problem.** Without Supabase credentials the whole game runs in **demo mode**: accounts, progress, shop, advent calendar and a local leaderboard (with practice rivals) are saved in your browser.

## Quick start (demo mode)

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules, demo backend and a headless game-loop test
npm run build      # production build into dist/
```

In demo mode the Advent page has a **Demo date preview** menu so you can test door unlocking and claiming missed days.

## Going online

### 1. Supabase
1. Create a project at supabase.com.
2. **SQL Editor** → paste all of `supabase/schema.sql` → Run. (Safe to re-run.)
3. **Authentication → Providers → Email**: enabled. For quick testing, turn off "Confirm email" (otherwise players confirm by email first).
4. **Database → Replication**: `leaderboard` should be in the `supabase_realtime` publication (the SQL does this for you).
5. **Project Settings → API**: copy the Project URL, the `anon` key and the `service_role` key.

### 2. Environment variables
Copy `.env.example` to `.env` for local use, and add the same values in **Netlify → Site configuration → Environment variables**:

| Variable | Where used | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | browser | no |
| `VITE_SUPABASE_ANON_KEY` | browser | no (protected by row-level security) |
| `SUPABASE_URL` | Netlify Functions | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify Functions only | **yes, never prefix with `VITE_`** |

`netlify.toml` already tells Netlify's secret scanner that the two public `VITE_` values are expected in the bundle.

### 3. Run functions locally (optional)
```bash
npm i -g netlify-cli
netlify dev        # serves the site and /.netlify/functions/*
```

### 4. Deploy
Push to GitHub, then Netlify → **Add new site → Import from Git**. Build command `npm run build`, publish directory `dist`, functions directory `netlify/functions` (all preset by `netlify.toml`). Add the four env vars and deploy.

## Troubleshooting Supabase (403 / 404 in the API logs)
1. Make sure `supabase/schema.sql` ran without errors (SQL Editor). If it did, run `supabase/fix-grants.sql` as well: newer projects do not auto-grant Data API access to new tables and functions.
2. `VITE_SUPABASE_URL` must be just `https://<ref>.supabase.co` (no `/rest/v1`, no trailing slash).
3. Functions crash with a "WebSocket library missing" stack trace: run `npm install` (installs `ws`, which the functions pass to supabase-js) and commit the updated `package-lock.json`.
4. After changing env vars on Netlify, trigger a fresh deploy.

## Updating an existing install
New installs get everything from `schema.sql`. If you installed earlier, run these once in the SQL Editor, in order, then redeploy:
1. `supabase/update-2-titles.sql` (titles), if you have not already.
2. `supabase/update-3-mods-feedback.sql` (equippable weapon mods and the feedback table).
3. `supabase/update-4-free-heroes.sql` (heroes are free, so a run no longer needs an inventory row for the hero).
4. `supabase/update-5-effects-secret-skin.sql` (coin-bought cosmetic effects and the `grant_item` helper).

## Giving yourself the Owner title
Titles that are earned in-game (kills, waves, bosses, advent, collection...) unlock automatically. Manual titles (`owner`, `founder`) can only be granted from the Supabase SQL Editor, which nobody else can reach:

```sql
select public.grant_title('YourUsername', 'owner');
```
It unlocks the title and equips it if you have none equipped. Equip or swap it any time on **Collection → Titles**. (In demo mode, Settings has a button that does the same locally.)

## Cosmetic effects and the secret skin
- **Effects** (Collection → Effects) are bought with coins and are purely visual: 5 trails, 4 auras and 3 defeat effects, one equipped per slot.
- **Arctic Wolf Spider** is a hidden Gingerbread Knight skin. It does not appear in the Collection at all until a player owns it, it cannot be bought, and it is handed out by you from the Supabase SQL Editor:
```sql
select public.grant_item('PlayerName', 'skin', 'knight_arctic');
```
  The same function can grant any item (`'character'`, `'skin'`, `'weapon'`, `'mod'`, `'cosmetic'`). In demo mode the Settings button grants it locally.

## How security works

- Browsers can **read** public data (leaderboard, public profiles) and their own rows. They can **not** write scores, coins, inventory, boosts or advent claims: row-level security has no write policies for those tables.
- All writes go through four Netlify Functions that verify the user's Supabase JWT, then call `SECURITY DEFINER` SQL functions that only the service role may run:
  - `start-run`: opens a server-timed run ticket and consumes the chosen boost.
  - `submit-score`: the **server computes the score** from raw run stats and rejects impossible runs (play time vs the server clock, wave vs time, kills vs the maximum enemies that can have spawned, boss/present limits). Tickets are single-use.
  - `claim-reward`: door N is claimable only if it is open on the **server's UTC clock**. Past doors can be claimed late, future doors never. One claim per user/year/day is enforced by a primary key.
  - `inventory`: buying (prices come from the server catalogue), equipping, and choosing a boost.
- Username search uses a `public_profiles` view that hides coins, boosts and settings.
- Be realistic: the game simulation runs in the browser, so a determined cheater can still submit *plausible* numbers. The checks stop casual tampering and absurd scores, not a perfect bot. Full protection would need a server-side simulation or replay verification.

## Project layout

```
src/
  data/        catalog (heroes, skins, enemies, bosses), advent rewards, upgrade rolling
  shared/      rules used by BOTH the browser/demo and Netlify Functions (scoring, validation, advent)
  game/        Phaser scene, procedural pixel sprites/textures, audio, UI event bus
  lib/         backends (demo + Supabase), app context, hooks, settings
  pages/       Home, Play, Advent, Leaderboard, Collection, Profile, Players, Settings
  components/  Layout, snow, auth modal, tables, sprites
netlify/       functions + shared server helper
supabase/      schema.sql
tests/         node:test suites (+ a mock Phaser for headless runs)
```

## Game notes
- **Bosses** have two phases. Each boss cycles through its own attacks (rings, aimed fans, spirals, telegraphed slams and rain, minion summons, charges, blinks) and goes **enraged** at 50% HP with a brief invulnerable roar, faster movement and a harder move list. A boss fight is an event: the field is cleared when it arrives (lesser enemies turn into XP gems), waves and regular spawns are paused until it dies (the HUD shows BOSS FIGHT), its summoned adds are capped at 6, the music switches to a boss riff, and beating it heals you 40%. If a fight drags past 90 seconds the waves start up again, so stalling isn't an option.
- **Arenas:** Santa's Village, Frozen Lake, Gingerbread Town and Santa's Workshop. They are purely cosmetic (different ground, props and snow colour) and one is picked at random for every run.
- **Weapon mods** are a collection. Every weapon has 3 mod slots; equip mods in **Collection → Mods** before a run. Mods change *behaviour* (Wind Gust knockback, Frost Touch slow, Echo repeats every 5th attack, Ricochet, Heat Seeker, Candy Hook, Gravity Gingerbread...) and never add damage, attack speed or XP. 15 mods. Eleven are awarded by titles, four by advent doors 4/9/15/18. Luck sources (a ~2% chance per mystery present, rolled by the server after the run, and the 500-coin Mod Crate) only ever give those four advent mods, never one a title can award.
- **Mouse aiming:** Settings → *Aim attacks with the mouse* (desktop, off by default). Snowballs, candy canes and bombs fire at the cursor instead of the nearest enemy, dashes follow it, and a crosshair appears. Touch screens always auto-aim.
- **Difficulty tuning** lives in `src/shared/rules.js` (`enemyHpScale`, `enemyDmgScale`, spawn rate). Enemy health at wave 20 is about 7x base (it was 5x). *Nutcracker Gunners* (from wave 4) keep their distance and shoot aimed shots, 2 at a time from wave 9 and 3 from wave 14, which also counters bell/orbit builds. Armor and regeneration upgrades are capped, and level-ups heal 5%.
- **Upgrade limits:** every stat has a ceiling (see `CAPS` in `src/data/upgrades.js`): damage +60%, attack speed +50%, move speed +40%, max HP x2, pickup range x3, XP gain +60%, crit 30%, armor 5, regen 2.5 HP/s, cooldown reduction 40%, luck 0.5, extra projectiles 2. Weapons stop at level 6 (`MAX_WEAPON_LEVEL`). A maxed stat leaves the card pool, and a card that would hit the limit says so. When the pool runs dry, level-ups give a Cocoa Refill (+20% HP), applied automatically without a menu. Enemies are unaffected.
- **Title screen:** a yellow, tilted, pulsing "Play tester version" splash sits at the bottom-right of the logo (in `HomePage.jsx` / `.splash` in `styles.css`; delete it when you launch).
- **Feedback:** Settings → *Send feedback or a suggestion*. Signed-in players only (spam control), max 5 per hour. Read the messages in Supabase → Table Editor → `feedback`. In demo mode they are kept on the device.
- **Hero abilities:** Snowman *Blizzard Storm*, Reindeer *Red Nose Beam* (a screen-wide beam that whips around twice in about 2 seconds), Gingerbread Knight *Gingerbread Garrison*.
- Heroes: all five (Santa, Elf, Snowman, Reindeer, Gingerbread Knight) and all five weapons are free from the start. Coins buy skins; mods come from titles, the advent calendar and luck.
- Upgrades come in Common / Rare / Epic / Legendary; luck and wave number shift the odds.
- Bosses arrive every 5th wave. Mystery presents can heal, blast, freeze, magnetise... or summon enemies.
- Advent doors open at 00:00 **UTC** on 1-24 December (midnight GMT for UK players).
