-- Update 4: heroes and weapons are free for everyone.
-- Run once in the Supabase SQL Editor on an EXISTING install (new installs: schema.sql already has it).
-- start_run no longer requires an inventory row for the chosen hero.
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
grant execute on function public.start_run(uuid, text, text) to service_role;
notify pgrst, 'reload schema';
