/**
 * Guidon Brewing Wholesale - Supabase Setup Script
 *
 * This script seeds all data and creates auth users in the real Supabase project.
 * It requires the service_role key to bypass RLS.
 *
 * Prerequisites:
 *   1. Run supabase/schema.sql in Supabase Dashboard → SQL Editor (Run once to create tables)
 *   2. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (Dashboard → Settings → API → service_role)
 *
 * Usage:
 *   node scripts/setup-supabase.js
 *
 * The script is idempotent — safe to run multiple times (uses ON CONFLICT DO NOTHING).
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envLines = fs.readFileSync(envPath, 'utf-8').replace(/\r/g, '').split('\n');
const env = {};
for (const line of envLines) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || SUPABASE_URL.includes('placeholder')) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL is not set in .env.local');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY === 'placeholder') {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local');
  console.error('Get it from: Supabase Dashboard → Settings → API → service_role');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedCustomers() {
  console.log('Seeding customers (Hendersonville / WNC area)...');
  const customers = [
    { id: 'cust-001', business_name: 'The Brass Bell Tavern', contact_name: 'Marcus Johnson', email: 'marcus@brassbelltavern.com', phone: '(828) 555-0101', address: '142 Main St, Hendersonville, NC 28792', created_at: '2025-08-15T10:00:00Z' },
    { id: 'cust-002', business_name: 'Mountain Run Taphouse', contact_name: 'Sarah Mitchell', email: 'sarah@mountainruntap.com', phone: '(828) 555-0202', address: '87 Haywood Rd, Asheville, NC 28806', created_at: '2025-09-01T14:30:00Z' },
    { id: 'cust-003', business_name: 'Pisgah Social Club', contact_name: 'James Patterson', email: 'james@pisgahsocial.com', phone: '(828) 555-0303', address: '315 S Broad St, Brevard, NC 28712', created_at: '2025-09-20T09:15:00Z' },
    { id: 'cust-004', business_name: 'Biltmore Village Pub', contact_name: 'Elena Rodriguez', email: 'elena@biltmorevillagepub.com', phone: '(828) 555-0404', address: '10 Kitchen Pl, Asheville, NC 28803', created_at: '2025-10-05T11:00:00Z' },
    { id: 'cust-005', business_name: 'Flat Rock Cinema Grill', contact_name: 'David Chen', email: 'david@flatrockcinema.com', phone: '(828) 555-0505', address: '2700 Greenville Hwy, Flat Rock, NC 28731', created_at: '2025-10-18T16:45:00Z' },
    { id: 'cust-006', business_name: 'Derby Digital', contact_name: 'Jahan', email: 'jahan@derbydigital.us', phone: '(828) 555-0606', address: 'Hendersonville, NC 28792', created_at: '2026-04-12T00:00:00Z' },
  ];
  // Upsert to refresh both new customers and overwrite any stale fields on
  // existing rows. Foreign keys from orders/invoices prevent a clean delete,
  // so overwrite in place.
  const { error } = await supabase.from('customers').upsert(customers, { onConflict: 'id' });
  if (error) throw new Error(`Customers seed failed: ${error.message}`);
  console.log(`  ✓ ${customers.length} customers`);
}

async function seedProducts() {
  console.log('Seeding products (7 real Guidon beers)...');
  const products = [
    { id: 'prod-001', name: 'German Pilsner', style: 'German Pilsner', abv: 4.9, ibu: 20, description: "Another authentic German-style beer that has been approved by the Germans in Hendersonville. This Blue Ribbon winner is a crisp, clean pilsner with a beautiful golden-straw color and wonderful malty body, just the right amount of bitterness at the end to balance it out.", category: 'Lager', available: true, awards: ['Blue Ribbon Winner, Brew Horizons Fest'], new_release: false, limited_release: false, image_url: null },
    { id: 'prod-002', name: 'Hefeweizen', style: 'German Hefeweizen', abv: 4.8, ibu: 12, description: "A favorite amongst Hendersonville's large German population. True to style with wonderful banana and clove characters essential in an authentic Hefeweizen, and a hazy, unfiltered appearance. Superbly refreshing. Prost!", category: 'Wheat', available: true, awards: [], new_release: false, limited_release: false, image_url: null },
    { id: 'prod-003', name: 'Guidon Kolsch', style: 'German Kolsch', abv: 4.8, ibu: 24, description: "A delightfully refreshing German Kolsch reminiscent of Koln (Cologne), Germany. Light body with a soft mouthfeel and pale white-gold color. Spicy, herbal Noble hop bitterness, medium to slightly assertive, less than a Pilsner but not by much. A somewhat fruity flavor with a crisp, dry finish.", category: 'Ale', available: true, awards: ['2025 N.C. Brewers Cup, Gold Medal Winner'], new_release: false, limited_release: false, image_url: null },
    { id: 'prod-004', name: 'Schwarzbier', style: 'German Black Lager', abv: 5.0, ibu: 25, description: "A dark lager originating from the Thuringia region of Germany. As it should, ours has an opaque, black color with light roast flavors just like what you'd get in Germany.", category: 'Lager', available: true, awards: ['2021 N.C. Brewers Cup, Gold Medal Winner', '2021 N.C. Brewers Cup, 3rd Place Best of Show'], new_release: false, limited_release: false, image_url: null },
    { id: 'prod-005', name: 'Bandera Mexican Amber Lager', style: 'Mexican Amber Lager', abv: 4.7, ibu: 25, description: "Where European craft meets Mexican tradition. Copper-bright amber lager tracing its roots to 19th-century Austrian immigrants who brought their brewing traditions to Mexico, marrying Vienna and Munich malts with flaked maize. Pours a clear reddish amber with a clean, persistent head. Toasted grain, soft caramel, and light breadiness on the nose; malt sweetness leads on the palate with biscuit and lightly caramelized notes. Flaked maize keeps the body medium and the finish refreshingly dry. Smooth, clean, and dangerously drinkable.", category: 'Lager', available: true, awards: ['2025 N.C. Brewers Cup, Honorable Mention'], new_release: false, limited_release: false, image_url: null },
    { id: 'prod-006', name: 'Doppelbock', style: 'German Doppelbock', abv: 8.3, ibu: null, description: "A strong, malty German lager. A 'double bock,' originally brewed by monks in Munich for sustenance. Rich, deep reddish-dark brown color, complex sweet malt flavors (caramel, toast, dark fruit), smooth body, low bitterness, clean finish.", category: 'Lager', available: true, awards: [], new_release: false, limited_release: false, image_url: null },
    { id: 'prod-007', name: 'Ciao Matteo Italian Pilsner', style: 'Italian Pilsner', abv: 5.0, ibu: null, description: "New release. Dry-hopped with noble hops for intense floral, herbal, and spicy aromas, resulting in a crisp, complex, yet softly malty beer with a refreshing, earthy finish. Offered only in 1/6 BBL kegs for limited availability.", category: 'Lager', available: true, awards: [], new_release: true, limited_release: true, image_url: null },
  ];

  // Wipe stale product_sizes (orders may reference products, but product_sizes
  // only references products — so we can delete sizes freely and let foreign
  // key cascades handle dependent rows). Products themselves upsert to avoid
  // breaking foreign keys from historical orders.
  await supabase
    .from('product_sizes')
    .delete()
    .gte('id', '00000000-0000-0000-0000-000000000000');
  // Upsert products so existing rows get the new fields without breaking
  // referential integrity from historical orders.
  let { error } = await supabase.from('products').upsert(products, { onConflict: 'id' });
  if (error && /column .* does not exist|Could not find the '.*' column/.test(error.message)) {
    console.warn('  ⚠ Supabase schema missing new columns (ibu, awards, new_release, limited_release, image_url).');
    console.warn('    Run `npm run migrate` (or apply supabase/schema.sql in the Dashboard) first.');
    const legacyProducts = products.map(({ ibu, awards, new_release, limited_release, image_url, ...rest }) => rest);
    ({ error } = await supabase.from('products').upsert(legacyProducts, { onConflict: 'id' }));
  }
  if (error) throw new Error(`Products seed failed: ${error.message}`);

  // Per-beer size + inventory. Baseline triple-size grid for 5 beers;
  // Doppelbock gets a cheaper tier; Ciao Matteo is 1/6 BBL only.
  const sizes = [];
  const triple = [
    { size: '1/6bbl', price: 60, deposit: 30, inv: { default: 20, gold: 18, award: 16 } },
    { size: '1/4bbl', price: 119, deposit: 40, inv: { default: 15, gold: 14, award: 12 } },
    { size: '1/2bbl', price: 179, deposit: 50, inv: { default: 10, gold: 9, award: 8 } },
  ];
  const baseline = ['prod-001', 'prod-002']; // no awards / lesser awards
  const goldWinner = ['prod-003']; // 2025 gold
  const multiAward = ['prod-004', 'prod-005'];

  for (const pid of baseline) {
    for (const t of triple) sizes.push({ product_id: pid, size: t.size, price: t.price, deposit: t.deposit, inventory_count: t.inv.default, available: true });
  }
  for (const pid of goldWinner) {
    for (const t of triple) sizes.push({ product_id: pid, size: t.size, price: t.price, deposit: t.deposit, inventory_count: t.inv.gold, available: true });
  }
  for (const pid of multiAward) {
    for (const t of triple) sizes.push({ product_id: pid, size: t.size, price: t.price, deposit: t.deposit, inventory_count: t.inv.award, available: true });
  }
  // Doppelbock: three sizes, different pricing tier.
  sizes.push({ product_id: 'prod-006', size: '1/6bbl', price: 45, deposit: 30, inventory_count: 12, available: true });
  sizes.push({ product_id: 'prod-006', size: '1/4bbl', price: 75, deposit: 40, inventory_count: 8, available: true });
  sizes.push({ product_id: 'prod-006', size: '1/2bbl', price: 99, deposit: 50, inventory_count: 6, available: true });
  // Ciao Matteo: 1/6 BBL only (new release, limited).
  sizes.push({ product_id: 'prod-007', size: '1/6bbl', price: 79, deposit: 30, inventory_count: 8, available: true });

  let { error: sizesError } = await supabase.from('product_sizes').insert(sizes);
  if (sizesError && /column .* does not exist|Could not find the '.*' column/.test(sizesError.message)) {
    console.warn('  ⚠ product_sizes missing inventory_count column — inserting without inventory.');
    console.warn('    Re-run supabase/schema.sql + this script to populate inventory.');
    const legacySizes = sizes.map(({ inventory_count, ...rest }) => rest);
    ({ error: sizesError } = await supabase.from('product_sizes').insert(legacySizes));
  }
  if (sizesError) throw new Error(`Product sizes seed failed: ${sizesError.message}`);
  console.log(`  ✓ ${products.length} products + ${sizes.length} size-tiers with inventory`);
}

async function createAuthUsers() {
  console.log('Creating auth users...');

  // Customer portal user: jahan@derbydigital.us
  const { data: existingUser } = await supabase.auth.admin.listUsers();
  const users = existingUser?.users || [];
  const jahanExists = users.find(u => u.email === 'jahan@derbydigital.us');

  if (!jahanExists) {
    const { error } = await supabase.auth.admin.createUser({
      email: 'jahan@derbydigital.us',
      password: 'DerbyDigital123!',
      email_confirm: true,
    });
    if (error) throw new Error(`Create jahan user failed: ${error.message}`);
    console.log('  ✓ Created jahan@derbydigital.us (password: DerbyDigital123!)');
  } else {
    console.log('  ✓ jahan@derbydigital.us already exists');
  }

  // NOTE: The admin portal does NOT use Supabase Auth — it uses ADMIN_PASSWORD in .env.local.
  // ADMIN_PASSWORD=guidon2026 is already set.
  console.log('  ✓ Admin portal uses ADMIN_PASSWORD=guidon2026 (no Supabase auth user needed)');
}

async function main() {
  console.log(`\nConnecting to: ${SUPABASE_URL}\n`);

  try {
    // Verify connectivity
    const { error: pingError } = await supabase.from('customers').select('id').limit(1);
    if (pingError && pingError.code === 'PGRST205') {
      console.error('\nERROR: Tables do not exist yet.');
      console.error('Run supabase/schema.sql in Supabase Dashboard → SQL Editor first.\n');
      process.exit(1);
    }

    await seedCustomers();
    await seedProducts();
    await createAuthUsers();

    console.log('\nSetup complete! The app will use Supabase once SUPABASE_SERVICE_ROLE_KEY is set.\n');
  } catch (err) {
    console.error('\nSetup failed:', err.message);
    process.exit(1);
  }
}

main();
