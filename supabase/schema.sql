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
  item_type text not null check (item_type in ('character','skin','weapon')),
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

-- ---------- Row level security ----------
alter table public.profiles enable row level security;
alter table public.inventory enable row level security;
alter table public.runs enable row level security;
alter table public.scores enable row level security;
alter table public.leaderboard enable row level security;
alter table public.advent_claims enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile settings" on public.profiles;
create policy "own profile settings" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own inventory" on public.inventory;
create policy "own inventory" on public.inventory for select using (auth.uid() = user_id);

drop policy if exists "own claims" on public.advent_claims;
create policy "own claims" on public.advent_claims for select using (auth.uid() = user_id);

drop policy if exists "public scores" on public.scores;
create policy "public scores" on public.scores for select using (true);

drop policy if exists "public leaderboard" on public.leaderboard;
create policy "public leaderboard" on public.leaderboard for select using (true);

-- runs: RLS on, NO policies => invisible to browsers.

-- Browsers may only edit the harmless `settings` column of their own profile.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (settings) on public.profiles to authenticated;
revoke insert, update, delete on public.inventory, public.runs, public.scores, public.leaderboard, public.advent_claims from anon, authenticated;

-- Public, non-sensitive view for profile pages and username search (hides coins, boosts, settings).
-- (Supabase may flag this as a "security definer view"; that is intentional here.)
create or replace view public.public_profiles as
  select id, username, selected_character, equipped, games_played, total_kills, total_score,
         best_score, best_wave, total_seconds, bosses_defeated, presents_opened, created_at
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
  if not exists (select 1 from inventory where user_id = p_user and item_type = 'character' and item_id = p_character) then
    raise exception 'character_locked';
  end if;
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
declare r runs%rowtype; prev int; uname text; rnk int;
begin
  select * into r from runs where id = p_run and user_id = p_user for update;
  if not found or r.submitted then raise exception 'invalid_run'; end if;
  update runs set submitted = true where id = p_run;
  select best_score, username into prev, uname from profiles where id = p_user;
  insert into scores (user_id, username, score, wave, kills, bosses, seconds, character)
    values (p_user, uname, p_score, p_wave, p_kills, p_bosses, p_seconds, p_character);
  update profiles set
    coins = coins + p_coins, games_played = games_played + 1, total_kills = total_kills + p_kills,
    total_score = total_score + p_score, best_score = greatest(best_score, p_score),
    best_wave = greatest(best_wave, p_wave), total_seconds = total_seconds + p_seconds,
    bosses_defeated = bosses_defeated + p_bosses, presents_opened = presents_opened + p_presents
  where id = p_user;
  insert into leaderboard (user_id, username, score, wave, kills, character)
    values (p_user, uname, p_score, p_wave, p_kills, p_character)
  on conflict (user_id) do update set
    score = excluded.score, wave = excluded.wave, kills = excluded.kills,
    character = excluded.character, achieved_at = now()
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
    elsif t in ('skin', 'weapon', 'character') then
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

-- ---------- Explicit grants ----------
-- Newer Supabase projects do NOT automatically expose new tables/functions to the Data API,
-- which shows up as 403 (permission denied) and 404 (function/table not found) in the logs.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.leaderboard, public.scores to anon, authenticated;
grant select on public.profiles, public.inventory, public.advent_claims to authenticated;
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

-- ---------- Realtime leaderboard ----------
do $$ begin
  alter publication supabase_realtime add table public.leaderboard;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
