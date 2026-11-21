-- =====================================================================
-- Update 6: FAST ACTIONS.
-- Buying and equipping used to go browser -> Netlify (US) -> Supabase (EU) several times, which is slow for players far
-- from the US. These functions run inside the database and are called straight from the browser: one round trip.
-- They identify the player with auth.uid() (the signed-in user), never with a parameter, so nobody can act as someone else.
-- Run this once, THEN run supabase/catalog.sql (generated from the game's data). Until both are run, the game
-- automatically falls back to the Netlify functions, so nothing breaks in between.
-- =====================================================================

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
