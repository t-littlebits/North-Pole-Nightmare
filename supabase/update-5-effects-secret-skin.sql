-- Update 5: coin-bought cosmetic effects + the grant_item helper for secret skins.
-- Run once in the Supabase SQL Editor on an EXISTING install (new installs: schema.sql already has it).

alter table public.profiles add column if not exists cosmetics jsonb not null default '{}'::jsonb;

do $$ declare c text; begin
  for c in select conname from pg_constraint
    where conrelid = 'public.inventory'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%item_type%'
  loop execute format('alter table public.inventory drop constraint %I', c); end loop;
end $$;
alter table public.inventory add constraint inventory_item_type_check check (item_type in ('character','skin','weapon','mod','cosmetic'));

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

notify pgrst, 'reload schema';
