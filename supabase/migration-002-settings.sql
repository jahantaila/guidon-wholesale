-- Brewery settings table: admin-editable email recipients + misc config.
-- Applied automatically the next time `npm run migrate` runs (schema.sql
-- already has CREATE TABLE IF NOT EXISTS + idempotent policies).
-- This file is kept as a reference of what was added for the settings
-- feature; the canonical source is still supabase/schema.sql.

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;
drop policy if exists "Service role full access" on settings;
create policy "Service role full access" on settings
  using (true) with check (true);

-- Seed default notification recipients if missing.
insert into settings (key, value)
  values ('notification_emails', '["sales@guidonbrewing.com"]'::jsonb)
  on conflict (key) do nothing;
