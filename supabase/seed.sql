-- Guidon Brewing Wholesale - Seed Data
-- Run this after schema.sql to populate initial data, or use
-- `node scripts/setup-supabase.js` which applies the same rows
-- plus creates the customer auth users.

-- ============================================================
-- CUSTOMERS (Hendersonville / Asheville / WNC area)
-- ============================================================
insert into customers (id, business_name, contact_name, email, phone, address, created_at) values
  ('cust-001', 'The Brass Bell Tavern',     'Marcus Johnson',   'marcus@brassbelltavern.com',   '(828) 555-0101', '142 Main St, Hendersonville, NC 28792',          '2025-08-15T10:00:00Z'),
  ('cust-002', 'Mountain Run Taphouse',     'Sarah Mitchell',   'sarah@mountainruntap.com',     '(828) 555-0202', '87 Haywood Rd, Asheville, NC 28806',              '2025-09-01T14:30:00Z'),
  ('cust-003', 'Pisgah Social Club',        'James Patterson',  'james@pisgahsocial.com',       '(828) 555-0303', '315 S Broad St, Brevard, NC 28712',               '2025-09-20T09:15:00Z'),
  ('cust-004', 'Biltmore Village Pub',      'Elena Rodriguez',  'elena@biltmorevillagepub.com', '(828) 555-0404', '10 Kitchen Pl, Asheville, NC 28803',              '2025-10-05T11:00:00Z'),
  ('cust-005', 'Flat Rock Cinema Grill',    'David Chen',       'david@flatrockcinema.com',     '(828) 555-0505', '2700 Greenville Hwy, Flat Rock, NC 28731',        '2025-10-18T16:45:00Z'),
  ('cust-006', 'Derby Digital',             'Jahan',            'jahan@derbydigital.us',        '(828) 555-0606', 'Hendersonville, NC 28792',                        '2026-04-12T00:00:00Z')
on conflict (id) do nothing;

-- ============================================================
-- AUTH USERS
-- Customer portal user (create via Supabase Dashboard Authentication > Users):
--   Email: jahan@derbydigital.us   Password: DerbyDigital123!
-- Admin portal uses ADMIN_PASSWORD env var, not Supabase Auth.
-- ============================================================

-- ============================================================
-- PRODUCTS — real Guidon Brewing catalog
-- ============================================================
insert into products (id, name, style, abv, ibu, description, category, available, awards, new_release, limited_release) values
  ('prod-001', 'German Pilsner',              'German Pilsner',      4.9,  20, 'Another authentic German-style beer that has been approved by the Germans in Hendersonville. This Blue Ribbon winner is a crisp, clean pilsner with a beautiful golden-straw color and wonderful malty body, just the right amount of bitterness at the end to balance it out.',                                                                                                                                                                                                              'Lager', true, '["Blue Ribbon Winner, Brew Horizons Fest"]'::jsonb, false, false),
  ('prod-002', 'Hefeweizen',                  'German Hefeweizen',   4.8,  12, 'A favorite amongst Hendersonville''s large German population. True to style with wonderful banana and clove characters essential in an authentic Hefeweizen, and a hazy, unfiltered appearance. Superbly refreshing. Prost!',                                                                                                                                                                                                                                                                      'Wheat', true, '[]'::jsonb,                                                                                                              false, false),
  ('prod-003', 'Guidon Kolsch',               'German Kolsch',       4.8,  24, 'A delightfully refreshing German Kolsch reminiscent of Koln (Cologne), Germany. Light body with a soft mouthfeel and pale white-gold color. Spicy, herbal Noble hop bitterness, medium to slightly assertive, less than a Pilsner but not by much. A somewhat fruity flavor with a crisp, dry finish.',                                                                                                                                                                                         'Ale',   true, '["2025 N.C. Brewers Cup, Gold Medal Winner"]'::jsonb,                                                                    false, false),
  ('prod-004', 'Schwarzbier',                 'German Black Lager',  5.0,  25, 'A dark lager originating from the Thuringia region of Germany. As it should, ours has an opaque, black color with light roast flavors just like what you''d get in Germany.',                                                                                                                                                                                                                                                                                                                       'Lager', true, '["2021 N.C. Brewers Cup, Gold Medal Winner", "2021 N.C. Brewers Cup, 3rd Place Best of Show"]'::jsonb,                  false, false),
  ('prod-005', 'Bandera Mexican Amber Lager', 'Mexican Amber Lager', 4.7,  25, 'Where European craft meets Mexican tradition. Copper-bright amber lager tracing its roots to 19th-century Austrian immigrants who brought their brewing traditions to Mexico, marrying Vienna and Munich malts with flaked maize. Pours a clear reddish amber with a clean, persistent head. Toasted grain, soft caramel, and light breadiness on the nose; malt sweetness leads on the palate with biscuit and lightly caramelized notes. Flaked maize keeps the body medium and the finish refreshingly dry. Smooth, clean, and dangerously drinkable.', 'Lager', true, '["2025 N.C. Brewers Cup, Honorable Mention"]'::jsonb,                                                                    false, false),
  ('prod-006', 'Doppelbock',                  'German Doppelbock',   8.3, null, 'A strong, malty German lager. A "double bock," originally brewed by monks in Munich for sustenance. Rich, deep reddish-dark brown color, complex sweet malt flavors (caramel, toast, dark fruit), smooth body, low bitterness, clean finish.',                                                                                                                                                                                                                                                     'Lager', true, '[]'::jsonb,                                                                                                              false, false),
  ('prod-007', 'Ciao Matteo Italian Pilsner', 'Italian Pilsner',     5.0, null, 'New release. Dry-hopped with noble hops for intense floral, herbal, and spicy aromas, resulting in a crisp, complex, yet softly malty beer with a refreshing, earthy finish. Offered only in 1/6 BBL kegs for limited availability.',                                                                                                                                                                                                                                                            'Lager', true, '[]'::jsonb,                                                                                                              true,  true)
on conflict (id) do nothing;

-- ============================================================
-- PRODUCT SIZES with inventory
-- Baseline lagers: 1/6 $60, 1/4 $119, 1/2 $179. Doppelbock pricing tier.
-- Ciao Matteo is 1/6 BBL only (limited release).
-- ============================================================
insert into product_sizes (product_id, size, price, deposit, inventory_count, available) values
  -- German Pilsner
  ('prod-001', '1/6bbl',  60, 30, 20, true),
  ('prod-001', '1/4bbl', 119, 40, 15, true),
  ('prod-001', '1/2bbl', 179, 50, 10, true),
  -- Hefeweizen
  ('prod-002', '1/6bbl',  60, 30, 20, true),
  ('prod-002', '1/4bbl', 119, 40, 15, true),
  ('prod-002', '1/2bbl', 179, 50, 10, true),
  -- Guidon Kolsch
  ('prod-003', '1/6bbl',  60, 30, 18, true),
  ('prod-003', '1/4bbl', 119, 40, 14, true),
  ('prod-003', '1/2bbl', 179, 50,  9, true),
  -- Schwarzbier
  ('prod-004', '1/6bbl',  60, 30, 16, true),
  ('prod-004', '1/4bbl', 119, 40, 12, true),
  ('prod-004', '1/2bbl', 179, 50,  8, true),
  -- Bandera
  ('prod-005', '1/6bbl',  60, 30, 16, true),
  ('prod-005', '1/4bbl', 119, 40, 12, true),
  ('prod-005', '1/2bbl', 179, 50,  8, true),
  -- Doppelbock (different tier)
  ('prod-006', '1/6bbl',  45, 30, 12, true),
  ('prod-006', '1/4bbl',  75, 40,  8, true),
  ('prod-006', '1/2bbl',  99, 50,  6, true),
  -- Ciao Matteo (1/6 BBL only, limited)
  ('prod-007', '1/6bbl',  79, 30,  8, true);
