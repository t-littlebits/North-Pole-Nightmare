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

## Updating an existing install (titles)
If you set up the database before titles existed, run `supabase/update-2-titles.sql` once in the SQL Editor (new installs get everything from `schema.sql`), then redeploy.

## Giving yourself the Owner title
Titles that are earned in-game (kills, waves, bosses, advent, collection...) unlock automatically. Manual titles (`owner`, `founder`) can only be granted from the Supabase SQL Editor, which nobody else can reach:

```sql
select public.grant_title('YourUsername', 'owner');
```
It unlocks the title and equips it if you have none equipped. Equip or swap it any time on **Collection → Titles**. (In demo mode, Settings has a button that does the same locally.)

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
- **Bosses** have two phases. Each boss cycles through its own attacks (rings, aimed fans, spirals, telegraphed slams and rain, minion summons, charges, blinks) and goes **enraged** at 50% HP with a brief invulnerable roar, faster movement and a harder move list.
- **Arenas:** Santa's Village (default), Frozen Lake (slippery ice, wave 5), Gingerbread Town (sticky syrup, wave 8), Haunted Workshop (ghosts from wave 1, flickering dark, +25% XP, wave 12). Reach the wave in any run to unlock; the server checks it.
- **Weapon mods:** a weapon at level 3 offers a mod, and a second one at level 6 (3 mods per weapon, e.g. Splitter snowballs, Burning Glaze bombs, Echo Frost).
- **Hero abilities:** Snowman *Blizzard Storm*, Reindeer *Red Nose Beam*, Gingerbread Knight *Gingerbread Garrison*.
- Heroes: Santa, Elf (free); Snowman, Reindeer, Gingerbread Knight (coins or Advent).
- Weapons: snowballs, candy canes, ice blast (free); Christmas bells, gingerbread bombs (coins or Advent). Unlocked weapons join the level-up pool.
- Upgrades come in Common / Rare / Epic / Legendary; luck and wave number shift the odds.
- Bosses arrive every 5th wave. Mystery presents can heal, blast, freeze, magnetise... or summon enemies.
- Advent doors open at 00:00 **UTC** on 1-24 December (midnight GMT for UK players).
