-- Guidon Brewing Wholesale - Seed Data
-- Run this after schema.sql to populate initial data

-- ============================================================
-- CUSTOMERS
-- ============================================================
insert into customers (id, business_name, contact_name, email, phone, address, created_at) values
  ('cust-001', 'The Brick House Bar & Grill', 'Marcus Johnson', 'marcus@brickhousebar.com', '(502) 555-0101', '1234 Bardstown Rd, Louisville, KY 40204', '2025-08-15T10:00:00Z'),
  ('cust-002', 'River City Taproom', 'Sarah Mitchell', 'sarah@rivercitytap.com', '(502) 555-0202', '567 Main St, Louisville, KY 40202', '2025-09-01T14:30:00Z'),
  ('cust-003', 'Derby Day Sports Bar', 'James Patterson', 'james@derbydaysports.com', '(502) 555-0303', '890 Frankfort Ave, Louisville, KY 40206', '2025-09-20T09:15:00Z'),
  ('cust-004', 'Magnolia Kitchen & Bar', 'Elena Rodriguez', 'elena@magnoliakb.com', '(502) 555-0404', '2345 Shelbyville Rd, Louisville, KY 40207', '2025-10-05T11:00:00Z'),
  ('cust-005', 'Old Louisville Brewing Co-op', 'David Chen', 'david@oldloubrewing.com', '(502) 555-0505', '678 S 3rd St, Louisville, KY 40203', '2025-10-18T16:45:00Z'),
  ('cust-006', 'Derby Digital', 'Jahan', 'jahan@derbydigital.us', '(502) 555-0606', 'Louisville, KY 40202', '2026-04-12T00:00:00Z')
on conflict (id) do nothing;

-- ============================================================
-- CREATE AUTH USERS IN SUPABASE
-- Run these via the Supabase Auth API or Dashboard:
--
--   Customer portal user:
--     Email: jahan@derbydigital.us
--     Password: DerbyDigital123!
--
-- OR use the Supabase Dashboard: Authentication > Users > Add User
-- Link each auth user to the customer record via email.
-- ============================================================

-- ============================================================
-- PRODUCTS
-- ============================================================
insert into products (id, name, style, abv, description, category, available) values
  ('prod-001', 'Guidon Gold', 'American Lager', 4.5, 'Crisp and clean with a light malt sweetness', 'Lager', true),
  ('prod-002', 'Derby Day IPA', 'West Coast IPA', 6.8, 'Bold citrus and pine hops with a clean bitter finish', 'IPA', true),
  ('prod-003', 'Bourbon Barrel Stout', 'Imperial Stout', 9.2, 'Rich chocolate and vanilla with bourbon warmth', 'Stout', true),
  ('prod-004', 'Bardstown Blonde', 'American Blonde Ale', 4.2, 'Light and approachable with subtle honey notes', 'Ale', true),
  ('prod-005', 'Louisville Wheat', 'American Hefeweizen', 5.0, 'Refreshing citrus and banana with a hazy finish', 'Wheat', true),
  ('prod-006', 'Thunder Over Porter', 'Robust Porter', 5.8, 'Dark roasted malt with hints of coffee and dark chocolate', 'Porter', true),
  ('prod-007', 'Falls City Pale', 'American Pale Ale', 5.2, 'Balanced hop character with light caramel malt', 'Ale', true),
  ('prod-008', 'Ohio River Red', 'American Amber Ale', 5.5, 'Caramel malt forward with earthy hop notes', 'Ale', true)
on conflict (id) do nothing;

insert into product_sizes (product_id, size, price, deposit, available) values
  ('prod-001', '1/2bbl', 200, 50, true),
  ('prod-001', '1/4bbl', 140, 40, true),
  ('prod-001', '1/6bbl', 90, 30, true),
  ('prod-002', '1/2bbl', 200, 50, true),
  ('prod-002', '1/4bbl', 140, 40, true),
  ('prod-002', '1/6bbl', 90, 30, true),
  ('prod-003', '1/2bbl', 200, 50, true),
  ('prod-003', '1/4bbl', 140, 40, true),
  ('prod-003', '1/6bbl', 90, 30, true),
  ('prod-004', '1/2bbl', 200, 50, true),
  ('prod-004', '1/4bbl', 140, 40, true),
  ('prod-004', '1/6bbl', 90, 30, true),
  ('prod-005', '1/2bbl', 200, 50, true),
  ('prod-005', '1/4bbl', 140, 40, true),
  ('prod-005', '1/6bbl', 90, 30, true),
  ('prod-006', '1/2bbl', 200, 50, true),
  ('prod-006', '1/4bbl', 140, 40, true),
  ('prod-006', '1/6bbl', 90, 30, true),
  ('prod-007', '1/2bbl', 200, 50, true),
  ('prod-007', '1/4bbl', 140, 40, true),
  ('prod-007', '1/6bbl', 90, 30, true),
  ('prod-008', '1/2bbl', 200, 50, true),
  ('prod-008', '1/4bbl', 140, 40, true),
  ('prod-008', '1/6bbl', 90, 30, true);
