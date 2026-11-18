-- Auto-send queue (phase 2). Run once in the Supabase SQL editor.
-- Safe to re-run.

alter table listings add column if not exists message_body text;
alter table listings add column if not exists send_status text;
alter table listings add column if not exists send_error text;
alter table listings add column if not exists sent_at timestamptz;
alter table listings add column if not exists replied_at timestamptz;

alter table listings drop constraint if exists listings_send_status_check;
alter table listings add constraint listings_send_status_check check (
  send_status is null
  or send_status in ('queued', 'sending', 'sent', 'failed', 'skipped')
);

create index if not exists listings_send_queue_idx
  on listings (send_status, first_seen_at)
  where send_status in ('queued', 'sending');
