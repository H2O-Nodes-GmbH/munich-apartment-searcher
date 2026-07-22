-- Run once if Data API can't read tables (auto-expose was disabled at project create).
-- Safe to re-run.

grant usage on schema public to postgres, anon, authenticated, service_role;

grant all on table public.search_configs to service_role;
grant all on table public.exclude_terms to service_role;
grant all on table public.listings to service_role;

grant select on table public.search_configs to authenticated;
grant select on table public.exclude_terms to authenticated;
grant select, update on table public.listings to authenticated;

-- Sequences / identity (none currently, but keep future-proof)
grant usage, select on all sequences in schema public to service_role;
