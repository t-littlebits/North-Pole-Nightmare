-- Run this in the Supabase SQL Editor if schema.sql is already installed and the API returns 403/404.
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
