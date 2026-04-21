-- Guidon Brewing Wholesale - Supabase Schema
-- Run this in your Supabase project SQL editor to create all tables.
-- SAFE TO RE-RUN: every CREATE uses IF NOT EXISTS and every ALTER uses
-- ADD COLUMN IF NOT EXISTS, so re-applying this file after an app update
-- that adds columns (inventory, awards, etc.) is the migration path.

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table if not exists customers (
  id text primary key default ('cust-' || substr(md5(random()::text), 1, 6)),
  business_name text not null,
  contact_name text not null,
  email text not null unique,
  phone text not null default '',
  address text not null default '',
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table customers enable row level security;
-- Service role (admin client) can do everything
drop policy if exists "Service role full access" on customers;
create policy "Service role full access" on customers
  using (true)
  with check (true);
-- Authenticated users can read their own customer row (by email match)
drop policy if exists "Customer self read" on customers;
create policy "Customer self read" on customers
  for select
  using (email = lower(auth.jwt() ->> 'email'));

-- ============================================================
-- PRODUCTS
-- ============================================================
create table if not exists products (
  id text primary key,
  name text not null,
  style text not null,
  abv numeric(4,2) not null,
  ibu int,
  description text not null default '',
  category text not null,
  available boolean not null default true,
  image_url text,
  awards jsonb not null default '[]'::jsonb,
  new_release boolean not null default false,
  limited_release boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists product_sizes (
  id uuid primary key default uuid_generate_v4(),
  product_id text not null references products(id) on delete cascade,
  size text not null check (size in ('1/2bbl', '1/4bbl', '1/6bbl')),
  price numeric(10,2) not null,
  deposit numeric(10,2) not null,
  inventory_count int not null default 0,
  available boolean not null default true
);

-- Idempotent migration: ensure new columns exist on previously created tables.
alter table products add column if not exists ibu int;
alter table products add column if not exists image_url text;
alter table products add column if not exists awards jsonb not null default '[]'::jsonb;
alter table products add column if not exists new_release boolean not null default false;
alter table products add column if not exists limited_release boolean not null default false;
alter table product_sizes add column if not exists inventory_count int not null default 0;
-- par_level is the "brew me more" threshold. When inventory_count drops
-- below par_level, dashboard surfaces a brewing alert. NULL means no
-- threshold configured for that size (falls back to a global default).
alter table product_sizes add column if not exists par_level int;

-- Drop the fixed-size CHECK constraints so admin can define custom sizes
-- (mixed case, 1 barrel, cans, bottles, etc.). The product_sizes row's
-- deposit column is the source of truth for what that size costs to
-- keep/return — no more dependency on a hardcoded deposits table.
alter table product_sizes drop constraint if exists product_sizes_size_check;
alter table keg_ledger drop constraint if exists keg_ledger_size_check;
alter table keg_returns drop constraint if exists keg_returns_size_check;

-- Display order: admin drags sizes up/down in the product form; we
-- persist the order here and render in ascending sort_order. NULL falls
-- back to the legacy insertion order.
alter table product_sizes add column if not exists sort_order int;

alter table products enable row level security;
drop policy if exists "Public read access" on products;
create policy "Public read access" on products for select using (true);
drop policy if exists "Service role write access" on products;
create policy "Service role write access" on products
  for all using (true) with check (true);

alter table product_sizes enable row level security;
drop policy if exists "Public read access" on product_sizes;
create policy "Public read access" on product_sizes for select using (true);
drop policy if exists "Service role write access" on product_sizes;
create policy "Service role write access" on product_sizes
  for all using (true) with check (true);

-- ============================================================
-- ORDERS
-- ============================================================
create table if not exists orders (
  id text primary key,
  customer_id text not null references customers(id),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'delivered', 'completed')),
  subtotal numeric(10,2) not null default 0,
  total_deposit numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  delivery_date date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id text not null references orders(id) on delete cascade,
  product_id text not null references products(id),
  product_name text not null,
  size text not null,
  quantity int not null,
  unit_price numeric(10,2) not null,
  deposit numeric(10,2) not null
);

create table if not exists keg_returns (
  id uuid primary key default uuid_generate_v4(),
  order_id text not null references orders(id) on delete cascade,
  size text not null,
  quantity int not null
);

alter table orders enable row level security;
drop policy if exists "Service role full access" on orders;
create policy "Service role full access" on orders using (true) with check (true);
drop policy if exists "Customer self read" on orders;
create policy "Customer self read" on orders for select
  using (customer_id in (select id from customers where email = lower(auth.jwt() ->> 'email')));
alter table order_items enable row level security;
drop policy if exists "Service role full access" on order_items;
create policy "Service role full access" on order_items using (true) with check (true);
alter table keg_returns enable row level security;
drop policy if exists "Service role full access" on keg_returns;
create policy "Service role full access" on keg_returns using (true) with check (true);

-- ============================================================
-- INVOICES
-- ============================================================
create table if not exists invoices (
  id text primary key,
  order_id text not null references orders(id),
  customer_id text not null references customers(id),
  status text not null default 'draft'
    check (status in ('draft', 'unpaid', 'paid', 'overdue')),
  subtotal numeric(10,2) not null default 0,
  total_deposit numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  issued_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz
);

-- Idempotent migration to expand the check constraint to include 'draft'
-- and add the sent_at column for pre-existing installs.
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check check (status in ('draft', 'unpaid', 'paid', 'overdue'));

-- Invoice line items live as a jsonb blob on the invoice row (a snapshot
-- of the order's items at the moment the invoice was issued, so invoices
-- stay correct even if the admin later edits the order or product prices
-- change). Without this column, createInvoice fails with
-- "Could not find the 'items' column of 'invoices' in the schema cache"
-- and order confirm breaks after inventory + ledger have already fired,
-- leaving the system in an inconsistent state.
alter table invoices add column if not exists items jsonb not null default '[]'::jsonb;

-- Orders lifecycle simplified: pending → confirmed → completed (+ cancelled).
-- 'delivered' was a redundant middle state and is dropped; any existing
-- 'delivered' rows need to be migrated to 'confirmed' or 'completed' out
-- of band.
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in ('pending', 'confirmed', 'completed', 'cancelled'));
-- Migrate any leftover 'delivered' rows forward to 'completed' so they
-- don't violate the new check constraint.
update orders set status = 'completed' where status = 'delivered';
alter table invoices add column if not exists sent_at timestamptz;

-- Customer-level notes for brewery staff context ("prefers Thursday
-- deliveries", "pays in cash", etc.). Not visible to the customer.
alter table customers add column if not exists notes text not null default '';
-- Customer tags for filtering/grouping (e.g. ["priority", "net-30", "tasting-room"]).
alter table customers add column if not exists tags jsonb not null default '[]'::jsonb;
-- When true, invoice automatically transitions draft -> unpaid (and emails
-- the customer) the moment an order is marked delivered. Default false so
-- admin reviews before billing.
alter table customers add column if not exists auto_send_invoices boolean not null default false;
-- Soft-delete for customers with order history. Hard delete fails on FK
-- constraints (orders, invoices, keg_ledger reference the customer).
-- Archived customers are hidden from dropdowns + listings by default but
-- their history stays intact for reporting.
alter table customers add column if not exists archived_at timestamptz;
-- True when the customer is on a temp password (admin generated it during
-- approval). Portal forces a change-password modal on login until cleared.
alter table customers add column if not exists must_change_password boolean not null default false;

-- Brewing schedule: admin records "I'm brewing Bandera 1/2bbl on Apr 25,
-- expected yield 20 kegs". Production page shows the earliest scheduled
-- brew date per product+size as "back in stock by" so customers + sales
-- know when deficits clear. completed_at is set when the brew lands
-- (admin marks it done), at which point inventory is added.
create table if not exists brew_schedule (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  size text not null,
  brew_date date not null,
  expected_yield integer not null default 0,
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists brew_schedule_product_size_idx on brew_schedule (product_id, size) where completed_at is null;
create index if not exists brew_schedule_brew_date_idx on brew_schedule (brew_date) where completed_at is null;
alter table brew_schedule enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Service role full access on brew_schedule') then
    create policy "Service role full access on brew_schedule" on brew_schedule for all to public using (true) with check (true);
  end if;
end $$;

-- Order templates: customers save a cart as a reusable template (e.g.
-- "Tuesday Regular"). One-click reload populates their cart next time.
-- Items is jsonb mirroring OrderItem shape.
create table if not exists order_templates (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table order_templates enable row level security;
drop policy if exists "Service role full access" on order_templates;
create policy "Service role full access" on order_templates using (true) with check (true);
drop policy if exists "Customer self read" on order_templates;
create policy "Customer self read" on order_templates for select
  using (customer_id in (select id from customers where email = lower(auth.jwt() ->> 'email')));
create index if not exists idx_order_templates_customer_id on order_templates(customer_id);

-- Recurring orders: admin sets up "Brass Bell auto-orders 2 Pilsner 1/2bbl
-- every 7 days." Daily cron (/api/cron/recurring-orders) reads active rows
-- with next_run_at <= now() and creates pending orders from the template.
-- Simple interval-in-days model (7, 14, 28). Fancier day-of-week scheduling
-- can be added later; this covers the 80% case.
create table if not exists recurring_orders (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  interval_days int not null check (interval_days > 0 and interval_days <= 365),
  next_run_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table recurring_orders enable row level security;
drop policy if exists "Service role full access" on recurring_orders;
create policy "Service role full access" on recurring_orders using (true) with check (true);
drop policy if exists "Customer self read" on recurring_orders;
create policy "Customer self read" on recurring_orders for select
  using (customer_id in (select id from customers where email = lower(auth.jwt() ->> 'email')));
create index if not exists idx_recurring_customer on recurring_orders(customer_id);
create index if not exists idx_recurring_next_run on recurring_orders(next_run_at) where active = true;
alter table recurring_orders add column if not exists heads_up_sent_at timestamptz;

alter table invoices enable row level security;
drop policy if exists "Service role full access" on invoices;
create policy "Service role full access" on invoices using (true) with check (true);
drop policy if exists "Customer self read" on invoices;
create policy "Customer self read" on invoices for select
  using (customer_id in (select id from customers where email = lower(auth.jwt() ->> 'email')));

-- ============================================================
-- KEG LEDGER
-- ============================================================
create table if not exists keg_ledger (
  id text primary key,
  customer_id text not null references customers(id),
  order_id text not null,
  type text not null check (type in ('deposit', 'return')),
  size text not null check (size in ('1/2bbl', '1/4bbl', '1/6bbl')),
  quantity int not null,
  deposit_amount numeric(10,2) not null,
  total_amount numeric(10,2) not null,
  date timestamptz not null default now(),
  notes text not null default ''
);

alter table keg_ledger enable row level security;
drop policy if exists "Service role full access" on keg_ledger;
create policy "Service role full access" on keg_ledger using (true) with check (true);
drop policy if exists "Customer self read" on keg_ledger;
create policy "Customer self read" on keg_ledger for select
  using (customer_id in (select id from customers where email = lower(auth.jwt() ->> 'email')));

-- ============================================================
-- WHOLESALE APPLICATIONS
-- ============================================================
create table if not exists applications (
  id text primary key,
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text not null default '',
  address text not null default '',
  message text not null default '',
  business_type text not null default '',
  expected_monthly_volume text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table applications enable row level security;
drop policy if exists "Service role full access" on applications;
create policy "Service role full access" on applications using (true) with check (true);

-- ============================================================
-- SETTINGS (admin-editable config: notification emails, etc.)
-- ============================================================
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;
drop policy if exists "Service role full access" on settings;
create policy "Service role full access" on settings
  using (true) with check (true);

-- Default notification recipients if no row exists yet.
insert into settings (key, value)
  values ('notification_emails', '["sales@guidonbrewing.com"]'::jsonb)
  on conflict (key) do nothing;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_orders_customer_id on orders(customer_id);
create index if not exists idx_invoices_customer_id on invoices(customer_id);
create index if not exists idx_invoices_order_id on invoices(order_id);
create index if not exists idx_keg_ledger_customer_id on keg_ledger(customer_id);
create index if not exists idx_order_items_order_id on order_items(order_id);
