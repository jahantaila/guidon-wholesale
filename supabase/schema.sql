-- Guidon Brewing Wholesale - Supabase Schema
-- Run this in your Supabase project SQL editor to create all tables

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
create policy "Service role full access" on customers
  using (true)
  with check (true);
-- Authenticated users can read their own customer row (by email match)
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
  description text not null default '',
  category text not null,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists product_sizes (
  id uuid primary key default uuid_generate_v4(),
  product_id text not null references products(id) on delete cascade,
  size text not null check (size in ('1/2bbl', '1/4bbl', '1/6bbl')),
  price numeric(10,2) not null,
  deposit numeric(10,2) not null,
  available boolean not null default true
);

alter table products enable row level security;
create policy "Public read access" on products for select using (true);
create policy "Service role write access" on products
  for all using (true) with check (true);

alter table product_sizes enable row level security;
create policy "Public read access" on product_sizes for select using (true);
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
create policy "Service role full access" on orders using (true) with check (true);
create policy "Customer self read" on orders for select
  using (customer_id in (select id from customers where email = lower(auth.jwt() ->> 'email')));
alter table order_items enable row level security;
create policy "Service role full access" on order_items using (true) with check (true);
alter table keg_returns enable row level security;
create policy "Service role full access" on keg_returns using (true) with check (true);

-- ============================================================
-- INVOICES
-- ============================================================
create table if not exists invoices (
  id text primary key,
  order_id text not null references orders(id),
  customer_id text not null references customers(id),
  status text not null default 'unpaid'
    check (status in ('unpaid', 'paid', 'overdue')),
  subtotal numeric(10,2) not null default 0,
  total_deposit numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  issued_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table invoices enable row level security;
create policy "Service role full access" on invoices using (true) with check (true);
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
create policy "Service role full access" on keg_ledger using (true) with check (true);
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
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table applications enable row level security;
create policy "Service role full access" on applications using (true) with check (true);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_orders_customer_id on orders(customer_id);
create index if not exists idx_invoices_customer_id on invoices(customer_id);
create index if not exists idx_invoices_order_id on invoices(order_id);
create index if not exists idx_keg_ledger_customer_id on keg_ledger(customer_id);
create index if not exists idx_order_items_order_id on order_items(order_id);
