-- CRM pipeline (phase 1). Run once in the Supabase SQL editor before deploying.
-- Safe to re-run.

-- Status becomes text + check constraint so stages can change without enum migrations.
alter table listings alter column status drop default;
alter table listings alter column status type text using status::text;

update listings set status = 'shortlisted' where status = 'interested';
update listings set status = 'messaged' where status = 'contacted';
update listings set status = 'lost' where status = 'rejected';

alter table listings drop constraint if exists listings_status_check;
alter table listings add constraint listings_status_check check (
  status in (
    'new', 'shortlisted', 'messaged', 'replied', 'viewing',
    'viewed', 'applied', 'won', 'lost'
  )
);
alter table listings alter column status set default 'new';

alter table listings add column if not exists stage_changed_at timestamptz;
alter table listings add column if not exists notes text;
alter table listings add column if not exists viewing_at timestamptz;

create index if not exists listings_status_idx on listings (status);

create table if not exists listing_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists listing_events_listing_idx
  on listing_events (listing_id, created_at desc);

create table if not exists message_templates (
  id text primary key,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table listing_events enable row level security;
alter table message_templates enable row level security;

grant all on table public.listing_events to service_role;
grant all on table public.message_templates to service_role;
