-- =====================================================================
-- Update 3: equippable weapon mods + player feedback.
-- Run once in the Supabase SQL Editor on an EXISTING install (after update-2-titles.sql).
-- New installs don't need it: schema.sql already includes everything.
-- =====================================================================

alter table public.profiles add column if not exists loadout jsonb not null default '{}'::jsonb;

-- Allow 'mod' as an inventory item type (drops whatever check currently guards item_type, then re-adds it).
do $$ declare c text; begin
  for c in select conname from pg_constraint
    where conrelid = 'public.inventory'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%item_type%'
  loop execute format('alter table public.inventory drop constraint %I', c); end loop;
end $$;
alter table public.inventory add constraint inventory_item_type_check check (item_type in ('character','skin','weapon','mod'));

-- Advent doors can now hand out mods.
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

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  username text,
  kind text not null check (kind in ('bug','suggestion','other')),
  message text not null check (char_length(message) between 5 and 1000),
  page text,
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function public.claim_advent(uuid, int, int, jsonb) to service_role;
notify pgrst, 'reload schema';
