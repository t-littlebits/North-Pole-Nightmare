-- =====================================================================
-- Update for an EXISTING install: adds titles (and keeps everything else as is).
-- Run once in the Supabase SQL Editor. New installs don't need this: schema.sql already includes it.
-- =====================================================================

alter table public.profiles add column if not exists equipped_title text;
alter table public.leaderboard add column if not exists title text;

create table if not exists public.user_titles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  title_id text not null,
  source text not null default 'achievement',
  granted_at timestamptz not null default now(),
  primary key (user_id, title_id)
);
alter table public.user_titles enable row level security;
drop policy if exists "own titles" on public.user_titles;
create policy "own titles" on public.user_titles for select using (auth.uid() = user_id);
revoke insert, update, delete on public.user_titles from anon, authenticated;

create or replace view public.public_profiles as
  select id, username, selected_character, equipped, games_played, total_kills, total_score,
         best_score, best_wave, total_seconds, bosses_defeated, presents_opened, created_at, equipped_title
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

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

grant usage on schema public to anon, authenticated, service_role;
grant select on public.user_titles to authenticated;
grant all on all tables in schema public to service_role;
grant execute on function public.apply_run(uuid, uuid, int, int, int, int, int, int, int, text) to service_role;
notify pgrst, 'reload schema';
