-- =====================================================================
-- North Pole Nightmare: Supabase schema
-- Run this whole file once in: Supabase Dashboard -> SQL Editor -> New query
-- Safe model: browsers can READ public data and their own data, but can
-- never write scores, coins, inventory or claims. Only Netlify Functions
-- (using the service-role key) call the RPCs at the bottom.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  coins int not null default 0 check (coins >= 0),
  selected_character text not null default 'santa',
  equipped jsonb not null default '{}'::jsonb,      -- {"santa": "santa_frost", ...}
  boosts jsonb not null default '{}'::jsonb,        -- {"xp_boost": 2, ...}
  active_boost text,
  equipped_title text,
  cosmetics jsonb not null default '{}'::jsonb,     -- equipped effects: {"trail": "trail_snow", "aura": ..., "kill": ...}
  loadout jsonb not null default '{}'::jsonb,       -- equipped weapon mods: {"snowball": ["echo","gust"], ...}
  settings jsonb not null default '{}'::jsonb,
  games_played int not null default 0,
  total_kills int not null default 0,
  total_score bigint not null default 0,
  best_score int not null default 0,
  best_wave int not null default 0,
  total_seconds int not null default 0,
  bosses_defeated int not null default 0,
  presents_opened int not null default 0,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,16}$')
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

create table if not exists public.inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('character','skin','weapon','mod','cosmetic')),
  item_id text not null,
  source text not null default 'default',
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

create table if not exists public.runs (            -- server-side run tickets (anti-cheat clock)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  character text not null,
  boost text,
  started_at timestamptz not null default now(),
  submitted boolean not null default false
);

create table if not exists public.scores (          -- every validated run
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  score int not null,
  wave int not null,
  kills int not null,
  bosses int not null,
  seconds int not null,
  character text not null,
  created_at timestamptz not null default now()
);
create index if not exists scores_user_idx on public.scores (user_id, created_at desc);

create table if not exists public.leaderboard (     -- one row per player: their all-time best
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null,
  score int not null,
  wave int not null,
  kills int not null,
  character text not null,
  title text,
  achieved_at timestamptz not null default now()
);
create index if not exists leaderboard_score_idx on public.leaderboard (score desc);

create table if not exists public.advent_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  year int not null,
  day int not null check (day between 1 and 24),
  reward jsonb not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, year, day)
);

create table if not exists public.user_titles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id text not null,
  source text not null default 'achievement',   -- 'achievement' or 'admin'
  granted_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists public.feedback (   -- player feedback / suggestions (read it in the Table Editor)
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  username text,
  kind text not null check (kind in ('bug','suggestion','other')),
  message text not null check (char_length(message) between 5 and 1000),
  page text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.inventory enable row level security;
alter table public.runs enable row level security;
alter table public.scores enable row level security;
alter table public.leaderboard enable row level security;
alter table public.advent_claims enable row level security;
alter table public.user_titles enable row level security;
alter table public.feedback enable row level security;   -- no policies: only the server can read or write it

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile settings" on public.profiles;
create policy "own profile settings" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own inventory" on public.inventory;
create policy "own inventory" on public.inventory for select using (auth.uid() = user_id);

drop policy if exists "own claims" on public.advent_claims;
create policy "own claims" on public.advent_claims for select using (auth.uid() = user_id);

drop policy if exists "own titles" on public.user_titles;
create policy "own titles" on public.user_titles for select using (auth.uid() = user_id);

drop policy if exists "public scores" on public.scores;
create policy "public scores" on public.scores for select using (true);

drop policy if exists "public leaderboard" on public.leaderboard;
create policy "public leaderboard" on public.leaderboard for select using (true);

-- runs: RLS on, NO policies => invisible to browsers.

-- Browsers may only edit the harmless `settings` column of their own profile.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (settings) on public.profiles to authenticated;
revoke insert, update, delete on public.inventory, public.runs, public.scores, public.leaderboard, public.advent_claims, public.user_titles from anon, authenticated;
revoke all on public.feedback from anon, authenticated;

-- Public, non-sensitive view for profile pages and username search (hides coins, boosts, settings).
-- (Supabase may flag this as a "security definer view"; that is intentional here.)
create or replace view public.public_profiles as
  select id, username, selected_character, equipped, games_played, total_kills, total_score,
         best_score, best_wave, total_seconds, bosses_defeated, presents_opened, created_at, equipped_title
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- ---------- New user bootstrap ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username', '');
  if uname !~ '^[A-Za-z0-9_]{3,16}$' or exists (select 1 from public.profiles where lower(username) = lower(uname)) then
    uname := 'Player' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  insert into public.inventory (user_id, item_type, item_id) values
    (new.id, 'character', 'santa'), (new.id, 'character', 'elf'),
    (new.id, 'weapon', 'snowball'), (new.id, 'weapon', 'candycane'), (new.id, 'weapon', 'iceblast'),
    (new.id, 'skin', 'santa_classic'), (new.id, 'skin', 'elf_classic'), (new.id, 'skin', 'snowman_classic'),
    (new.id, 'skin', 'reindeer_classic'), (new.id, 'skin', 'knight_classic');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the sign-up form check a name before creating the account.
create or replace function public.username_available(p_name text) returns boolean
language sql security definer set search_path = public as $$
  select p_name ~ '^[A-Za-z0-9_]{3,16}$' and not exists (select 1 from public.profiles where lower(username) = lower(p_name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- Server-only RPCs (called by Netlify Functions with the service role) ----------
create or replace function public.start_run(p_user uuid, p_character text, p_boost text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; used text := null;
begin
  if p_boost is not null and p_boost <> '' then
    update profiles set boosts = jsonb_set(boosts, array[p_boost], to_jsonb((boosts->>p_boost)::int - 1))
      where id = p_user and coalesce((boosts->>p_boost)::int, 0) > 0;
    if found then used := p_boost; end if;
  end if;
  update runs set submitted = true where user_id = p_user and submitted = false;
  insert into runs (user_id, character, boost) values (p_user, p_character, used) returning id into rid;
  return jsonb_build_object('run_id', rid, 'boost', used);
end $$;

create or replace function public.apply_run(
  p_run uuid, p_user uuid, p_score int, p_wave int, p_kills int, p_bosses int,
  p_seconds int, p_presents int, p_coins int, p_character text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r runs%rowtype; prev int; uname text; ttl text; rnk int;
begin
  select * into r from runs where id = p_run and user_id = p_user for update;
  if not found or r.submitted then raise exception 'invalid_run'; end if;
  update runs set submitted = true where id = p_run;
  select best_score, username, equipped_title into prev, uname, ttl from profiles where id = p_user;
  insert into scores (user_id, username, score, wave, kills, bosses, seconds, character)
    values (p_user, uname, p_score, p_wave, p_kills, p_bosses, p_seconds, p_character);
  update profiles set
    coins = coins + p_coins, games_played = games_played + 1, total_kills = total_kills + p_kills,
    total_score = total_score + p_score, best_score = greatest(best_score, p_score),
    best_wave = greatest(best_wave, p_wave), total_seconds = total_seconds + p_seconds,
    bosses_defeated = bosses_defeated + p_bosses, presents_opened = presents_opened + p_presents
  where id = p_user;
  insert into leaderboard (user_id, username, score, wave, kills, character, title)
    values (p_user, uname, p_score, p_wave, p_kills, p_character, ttl)
  on conflict (user_id) do update set
    score = excluded.score, wave = excluded.wave, kills = excluded.kills,
    character = excluded.character, title = excluded.title, achieved_at = now()
    where leaderboard.score < excluded.score;
  select count(*) + 1 into rnk from leaderboard where score > (select score from leaderboard where user_id = p_user);
  return jsonb_build_object('is_best', p_score > prev, 'prev_best', prev, 'rank', rnk);
end $$;

create or replace function public.claim_advent(p_user uuid, p_year int, p_day int, p_reward jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g jsonb; t text;
begin
  insert into advent_claims (user_id, year, day, reward) values (p_user, p_year, p_day, p_reward); -- 23505 if claimed
  for g in select * from jsonb_array_elements(p_reward->'grants') loop
    t := g->>'type';
    if t = 'coins' then
      update profiles set coins = coins + (g->>'amount')::int where id = p_user;
    elsif t in ('skin', 'weapon', 'character', 'mod') then
      insert into inventory (user_id, item_type, item_id, source) values (p_user, t, g->>'id', 'advent') on conflict do nothing;
    elsif t = 'boost' then
      update profiles set boosts = jsonb_set(boosts, array[g->>'id'],
        to_jsonb(coalesce((boosts->>(g->>'id'))::int, 0) + coalesce((g->>'amount')::int, 1))) where id = p_user;
    end if;
  end loop;
  return p_reward;
end $$;

create or replace function public.buy_item(p_user uuid, p_type text, p_id text, p_price int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from inventory where user_id = p_user and item_type = p_type and item_id = p_id) then
    raise exception 'already_owned';
  end if;
  update profiles set coins = coins - p_price where id = p_user and coins >= p_price;
  if not found then raise exception 'not_enough_coins'; end if;
  insert into inventory (user_id, item_type, item_id, source) values (p_user, p_type, p_id, 'shop');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.start_run(uuid, text, text) from public, anon, authenticated;
revoke all on function public.apply_run(uuid, uuid, int, int, int, int, int, int, int, text) from public, anon, authenticated;
revoke all on function public.claim_advent(uuid, int, int, jsonb) from public, anon, authenticated;
revoke all on function public.buy_item(uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.start_run(uuid, text, text) to service_role;
grant execute on function public.apply_run(uuid, uuid, int, int, int, int, int, int, int, text) to service_role;
grant execute on function public.claim_advent(uuid, int, int, jsonb) to service_role;
grant execute on function public.buy_item(uuid, text, text, int) to service_role;

-- ---------- Owner / admin titles ----------
-- Run this yourself in the Supabase SQL Editor to hand out a manual title (e.g. 'owner' or 'founder'):
--   select public.grant_title('YourUsername', 'owner');
-- Nobody else can call it: it is not exposed to the browser or the anon/authenticated roles.
create or replace function public.grant_title(p_username text, p_title text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from public.profiles where lower(username) = lower(p_username);
  if uid is null then raise exception 'No such player: %', p_username; end if;
  insert into public.user_titles (user_id, title_id, source) values (uid, p_title, 'admin') on conflict do nothing;
  update public.profiles set equipped_title = p_title where id = uid and equipped_title is null;
  update public.leaderboard set title = p_title where user_id = uid and title is null;
  return 'Granted ' || p_title || ' to ' || p_username;
end $$;
revoke all on function public.grant_title(text, text) from public, anon, authenticated;

-- Hand a player a secret/special item (e.g. the hidden Arctic Wolf Spider skin). Run it yourself in the SQL Editor:
--   select public.grant_item('PlayerName', 'skin', 'knight_arctic');
-- Not exposed to the browser or the anon/authenticated roles.
create or replace function public.grant_item(p_username text, p_type text, p_id text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if p_type not in ('character', 'skin', 'weapon', 'mod', 'cosmetic') then raise exception 'Unknown item type: %', p_type; end if;
  select id into uid from public.profiles where lower(username) = lower(p_username);
  if uid is null then raise exception 'No such player: %', p_username; end if;
  insert into public.inventory (user_id, item_type, item_id, source) values (uid, p_type, p_id, 'admin') on conflict do nothing;
  return 'Granted ' || p_type || ' ' || p_id || ' to ' || p_username;
end $$;
revoke all on function public.grant_item(text, text, text) from public, anon, authenticated;

-- ---------- Explicit grants ----------
-- Newer Supabase projects do NOT automatically expose new tables/functions to the Data API,
-- which shows up as 403 (permission denied) and 404 (function/table not found) in the logs.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.leaderboard, public.scores to anon, authenticated;
grant select on public.profiles, public.inventory, public.advent_claims, public.user_titles to authenticated;
grant select on public.public_profiles to anon, authenticated;
grant update (settings) on public.profiles to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.start_run(uuid, text, text) to service_role;
grant execute on function public.apply_run(uuid, uuid, int, int, int, int, int, int, int, text) to service_role;
grant execute on function public.claim_advent(uuid, int, int, jsonb) to service_role;
grant execute on function public.buy_item(uuid, text, text, int) to service_role;
notify pgrst, 'reload schema';  -- refresh the API's schema cache

-- ---------- Fast actions (kept identical to update-6-fast-actions.sql) ----------

create table if not exists public.catalog_items (
  type text not null,            -- character | weapon | skin | cosmetic | mod | title | boost | crate
  id text not null,
  price int not null default 0,
  slot text,                     -- cosmetics: trail | aura | kill
  parent text,                   -- skins: the character they belong to
  source text,                   -- skins: default | shop | advent | secret
  rarity text,
  weapons text[],                -- mods: weapons they fit (null = any weapon)
  achievement boolean not null default false,   -- mods that a title can award (never given by luck)
  hidden boolean not null default false,
  primary key (type, id)
);
alter table public.catalog_items enable row level security;
drop policy if exists "public catalog" on public.catalog_items;
create policy "public catalog" on public.catalog_items for select using (true);
revoke insert, update, delete on public.catalog_items from anon, authenticated;
grant select on public.catalog_items to anon, authenticated;

create or replace function public._catalog_ready() returns void
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from public.catalog_items) then raise exception 'catalog_missing'; end if;
end $$;

-- Free heroes and weapons count as owned; everything else needs an inventory row.
create or replace function public._owns(p_user uuid, p_type text, p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.catalog_items c where c.type = p_type and c.id = p_id and c.price = 0 and p_type in ('character', 'weapon'))
      or exists (select 1 from public.inventory i where i.user_id = p_user and i.item_type = p_type and i.item_id = p_id);
$$;

create or replace function public.shop_buy(p_type text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.catalog_items%rowtype;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public._catalog_ready();
  select * into c from public.catalog_items where type = p_type and id = p_id;
  if not found or p_type not in ('skin', 'cosmetic', 'character', 'weapon') or c.price <= 0 or (p_type = 'skin' and c.source is distinct from 'shop') then
    raise exception 'not_for_sale';
  end if;
  if exists (select 1 from public.inventory where user_id = uid and item_type = p_type and item_id = p_id) then raise exception 'already_owned'; end if;
  update public.profiles set coins = coins - c.price where id = uid and coins >= c.price;
  if not found then raise exception 'not_enough_coins'; end if;
  insert into public.inventory (user_id, item_type, item_id, source) values (uid, p_type, p_id, 'shop');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.shop_equip_character(p_character text, p_skin text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public._catalog_ready();
  if not exists (select 1 from public.catalog_items where type = 'character' and id = p_character) or not public._owns(uid, 'character', p_character) then
    raise exception 'character_locked';
  end if;
  if p_skin is not null and (not exists (select 1 from public.catalog_items where type = 'skin' and id = p_skin and parent = p_character) or not public._owns(uid, 'skin', p_skin)) then
    raise exception 'skin_locked';
  end if;
  update public.profiles set selected_character = p_character,
    equipped = case when p_skin is null then equipped else jsonb_set(equipped, array[p_character], to_jsonb(p_skin)) end
  where id = uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.shop_equip_cosmetic(p_slot text, p_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public._catalog_ready();
  if p_slot not in ('trail', 'aura', 'kill') then raise exception 'bad_slot'; end if;
  if p_id is null then
    update public.profiles set cosmetics = cosmetics - p_slot where id = uid;
  else
    if not exists (select 1 from public.catalog_items where type = 'cosmetic' and id = p_id and slot = p_slot) then raise exception 'bad_slot'; end if;
    if not public._owns(uid, 'cosmetic', p_id) then raise exception 'cosmetic_locked'; end if;
    update public.profiles set cosmetics = jsonb_set(cosmetics, array[p_slot], to_jsonb(p_id)) where id = uid;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.shop_equip_loadout(p_weapon text, p_mods text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m text; n int := coalesce(array_length(p_mods, 1), 0);
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public._catalog_ready();
  if not exists (select 1 from public.catalog_items where type = 'weapon' and id = p_weapon) or not public._owns(uid, 'weapon', p_weapon) then
    raise exception 'weapon_locked';
  end if;
  if n > 3 or (select count(distinct x) from unnest(coalesce(p_mods, '{}'::text[])) as x) <> n then raise exception 'too_many_slots'; end if;
  foreach m in array coalesce(p_mods, '{}'::text[]) loop
    if not exists (select 1 from public.catalog_items c where c.type = 'mod' and c.id = m and (c.weapons is null or p_weapon = any (c.weapons))) then raise exception 'mod_does_not_fit'; end if;
    if not exists (select 1 from public.inventory i where i.user_id = uid and i.item_type = 'mod' and i.item_id = m) then raise exception 'mod_locked'; end if;
  end loop;
  update public.profiles set loadout = case when n = 0 then loadout - p_weapon else jsonb_set(loadout, array[p_weapon], to_jsonb(p_mods)) end where id = uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.shop_equip_title(p_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_id is not null and not exists (select 1 from public.user_titles where user_id = uid and title_id = p_id) then raise exception 'title_locked'; end if;
  update public.profiles set equipped_title = p_id where id = uid;
  update public.leaderboard set title = p_id where user_id = uid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.shop_set_boost(p_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_id is not null and coalesce((select (boosts ->> p_id)::int from public.profiles where id = uid), 0) <= 0 then raise exception 'no_boost'; end if;
  update public.profiles set active_boost = p_id where id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- Mod Crate: a random mod you do not own that no title can award, weighted by rarity (the server rolls it, not the browser).
create or replace function public.shop_open_crate() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); crate_price int; pick text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public._catalog_ready();
  select c.price into crate_price from public.catalog_items c where c.type = 'crate' and c.id = 'mod_crate';
  if crate_price is null then raise exception 'catalog_missing'; end if;
  select c.id into pick from public.catalog_items c
    where c.type = 'mod' and not c.achievement
      and not exists (select 1 from public.inventory i where i.user_id = uid and i.item_type = 'mod' and i.item_id = c.id)
    order by -ln(1.0 - random()) / (case c.rarity when 'common' then 5.0 when 'rare' then 3.0 when 'epic' then 1.0 else 0.5 end)
    limit 1;
  if pick is null then raise exception 'crate_empty'; end if;
  update public.profiles set coins = coins - crate_price where id = uid and coins >= crate_price;
  if not found then raise exception 'not_enough_coins'; end if;
  insert into public.inventory (user_id, item_type, item_id, source) values (uid, 'mod', pick, 'shop');
  return jsonb_build_object('ok', true, 'mod', pick);
end $$;

-- Starts a run for the signed-in player (opens the server-timed ticket, consumes the chosen boost) in one call.
create or replace function public.start_run_me(p_character text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); b text; r jsonb; pr record;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  perform public._catalog_ready();
  if not exists (select 1 from public.catalog_items where type = 'character' and id = p_character) or not public._owns(uid, 'character', p_character) then
    raise exception 'character_locked';
  end if;
  select active_boost into b from public.profiles where id = uid;
  r := public.start_run(uid, p_character, b);
  select loadout, cosmetics into pr from public.profiles where id = uid;
  return r || jsonb_build_object('loadout', pr.loadout, 'cosmetics', pr.cosmetics);
end $$;

revoke all on function public._catalog_ready() from public, anon, authenticated;
revoke all on function public._owns(uuid, text, text) from public, anon, authenticated;
revoke all on function public.shop_buy(text, text), public.shop_equip_character(text, text), public.shop_equip_cosmetic(text, text),
  public.shop_equip_loadout(text, text[]), public.shop_equip_title(text), public.shop_set_boost(text), public.shop_open_crate(),
  public.start_run_me(text) from public, anon;
grant execute on function public.shop_buy(text, text), public.shop_equip_character(text, text), public.shop_equip_cosmetic(text, text),
  public.shop_equip_loadout(text, text[]), public.shop_equip_title(text), public.shop_set_boost(text), public.shop_open_crate(),
  public.start_run_me(text) to authenticated;
grant all on public.catalog_items to service_role;
notify pgrst, 'reload schema';

-- ---------- Realtime leaderboard ----------
do $$ begin
  alter publication supabase_realtime add table public.leaderboard;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
