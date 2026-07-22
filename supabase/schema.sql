-- Munich apartment searcher — run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists search_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  search_url text not null,
  active boolean not null default true,
  last_polled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists exclude_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  created_at timestamptz not null default now()
);

insert into exclude_terms (term) values
  ('tausch'),
  ('swap'),
  ('tauschwohnung'),
  ('wohnungstausch'),
  ('tauschobjekt'),
  ('mietertausch'),
  ('untermiete'),
  ('zwischenmiete'),
  ('wg'),
  ('wohngemeinschaft'),
  ('gesucht'),
  ('gesuch')
on conflict (term) do nothing;

do $$ begin
  create type listing_status as enum ('new', 'interested', 'contacted', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  search_config_id uuid references search_configs(id) on delete set null,
  title text not null,
  price_text text,
  price_eur numeric,
  location text,
  url text not null,
  thumbnail_url text,
  description_snippet text,
  posted_at timestamptz,
  posted_text text,
  is_excluded boolean not null default false,
  matched_exclude_terms text[] not null default '{}',
  status listing_status not null default 'new',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists listings_first_seen_idx on listings (first_seen_at desc);
create index if not exists listings_search_config_idx on listings (search_config_id);
create index if not exists listings_excluded_status_idx on listings (is_excluded, status);
create index if not exists listings_price_eur_idx on listings (price_eur);

-- Personal tool: server uses the service role key. Keep RLS on; no anon policies.
alter table search_configs enable row level security;
alter table exclude_terms enable row level security;
alter table listings enable row level security;

-- Needed when "Automatically expose new tables" is disabled at project create.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.search_configs to service_role;
grant all on table public.exclude_terms to service_role;
grant all on table public.listings to service_role;
grant usage, select on all sequences in schema public to service_role;
