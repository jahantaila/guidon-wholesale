-- Migration 003: order reporting date, "Sent text" CRM activity, follow-up
-- reminder de-duplication. Idempotent; safe to re-run. The same statements
-- are appended to schema.sql so a fresh database gets them too.
--
-- Paste into Supabase Dashboard -> SQL Editor, or run `bun run migrate`
-- with SUPABASE_ACCESS_TOKEN set.

-- ============================================================
-- ORDER REPORTING DATE
-- ============================================================
-- Mike enters some brewery orders after month-end that belong to the
-- previous month. created_at stays the true entry time and is never edited;
-- reporting_date is the brewery-local day the order counts toward in reports.
-- NULL = the day it was placed.
alter table orders add column if not exists reporting_date date;

-- Every change to reporting_date, so a back-dated order is always visible as
-- one. Admin auth is a single shared password, so there is no "who" to record.
create table if not exists order_reporting_date_changes (
  id uuid primary key default uuid_generate_v4(),
  order_id text not null references orders(id) on delete cascade,
  previous_date date,
  new_date date,
  changed_at timestamptz not null default now()
);
create index if not exists idx_order_reporting_date_changes_order
  on order_reporting_date_changes(order_id, changed_at desc);

alter table order_reporting_date_changes enable row level security;
drop policy if exists "Service role full access" on order_reporting_date_changes;
create policy "Service role full access" on order_reporting_date_changes
  using (true) with check (true);

-- ============================================================
-- CRM: "Sent text" activity type
-- ============================================================
alter table crm_activities drop constraint if exists crm_activities_type_check;
alter table crm_activities add constraint crm_activities_type_check check (type in
  ('sent_email', 'sent_text', 'spoke_phone', 'left_voicemail', 'cold_call', 'dropped_samples'));

-- ============================================================
-- CRM: follow-up reminder emails
-- ============================================================
-- One row per reminder actually sent. The primary key is what stops a cron
-- retry from sending twice. Moving a follow-up to a new date is a new key, so
-- the new date gets its own reminders and the old date's never fire again.
create table if not exists crm_followup_reminders (
  subject_id text not null,
  followup_date date not null,
  kind text not null check (kind in ('day_before', 'day_of')),
  sent_at timestamptz not null default now(),
  primary key (subject_id, followup_date, kind)
);

alter table crm_followup_reminders enable row level security;
drop policy if exists "Service role full access" on crm_followup_reminders;
create policy "Service role full access" on crm_followup_reminders
  using (true) with check (true);
