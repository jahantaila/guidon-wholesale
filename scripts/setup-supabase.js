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
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
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
  console.log('Seeding customers...');
  const customers = [
    { id: 'cust-001', business_name: 'The Brick House Bar & Grill', contact_name: 'Marcus Johnson', email: 'marcus@brickhousebar.com', phone: '(502) 555-0101', address: '1234 Bardstown Rd, Louisville, KY 40204', created_at: '2025-08-15T10:00:00Z' },
    { id: 'cust-002', business_name: 'River City Taproom', contact_name: 'Sarah Mitchell', email: 'sarah@rivercitytap.com', phone: '(502) 555-0202', address: '567 Main St, Louisville, KY 40202', created_at: '2025-09-01T14:30:00Z' },
    { id: 'cust-003', business_name: 'Derby Day Sports Bar', contact_name: 'James Patterson', email: 'james@derbydaysports.com', phone: '(502) 555-0303', address: '890 Frankfort Ave, Louisville, KY 40206', created_at: '2025-09-20T09:15:00Z' },
    { id: 'cust-004', business_name: 'Magnolia Kitchen & Bar', contact_name: 'Elena Rodriguez', email: 'elena@magnoliakb.com', phone: '(502) 555-0404', address: '2345 Shelbyville Rd, Louisville, KY 40207', created_at: '2025-10-05T11:00:00Z' },
    { id: 'cust-005', business_name: 'Old Louisville Brewing Co-op', contact_name: 'David Chen', email: 'david@oldloubrewing.com', phone: '(502) 555-0505', address: '678 S 3rd St, Louisville, KY 40203', created_at: '2025-10-18T16:45:00Z' },
    { id: 'cust-006', business_name: 'Derby Digital', contact_name: 'Jahan', email: 'jahan@derbydigital.us', phone: '(502) 555-0606', address: 'Louisville, KY 40202', created_at: '2026-04-12T00:00:00Z' },
  ];
  const { error } = await supabase.from('customers').upsert(customers, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(`Customers seed failed: ${error.message}`);
  console.log(`  ✓ ${customers.length} customers`);
}

async function seedProducts() {
  console.log('Seeding products...');
  const products = [
    { id: 'prod-001', name: 'Guidon Gold', style: 'American Lager', abv: 4.5, description: 'Crisp and clean with a light malt sweetness', category: 'Lager', available: true },
    { id: 'prod-002', name: 'Derby Day IPA', style: 'West Coast IPA', abv: 6.8, description: 'Bold citrus and pine hops with a clean bitter finish', category: 'IPA', available: true },
    { id: 'prod-003', name: 'Bourbon Barrel Stout', style: 'Imperial Stout', abv: 9.2, description: 'Rich chocolate and vanilla with bourbon warmth', category: 'Stout', available: true },
    { id: 'prod-004', name: 'Bardstown Blonde', style: 'American Blonde Ale', abv: 4.2, description: 'Light and approachable with subtle honey notes', category: 'Ale', available: true },
    { id: 'prod-005', name: 'Louisville Wheat', style: 'American Hefeweizen', abv: 5.0, description: 'Refreshing citrus and banana with a hazy finish', category: 'Wheat', available: true },
    { id: 'prod-006', name: 'Thunder Over Porter', style: 'Robust Porter', abv: 5.8, description: 'Dark roasted malt with hints of coffee and dark chocolate', category: 'Porter', available: true },
    { id: 'prod-007', name: 'Falls City Pale', style: 'American Pale Ale', abv: 5.2, description: 'Balanced hop character with light caramel malt', category: 'Ale', available: true },
    { id: 'prod-008', name: 'Ohio River Red', style: 'American Amber Ale', abv: 5.5, description: 'Caramel malt forward with earthy hop notes', category: 'Ale', available: true },
  ];
  const { error } = await supabase.from('products').upsert(products, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(`Products seed failed: ${error.message}`);

  const sizes = [];
  for (const prod of products) {
    sizes.push({ product_id: prod.id, size: '1/2bbl', price: 200, deposit: 50, available: true });
    sizes.push({ product_id: prod.id, size: '1/4bbl', price: 140, deposit: 40, available: true });
    sizes.push({ product_id: prod.id, size: '1/6bbl', price: 90, deposit: 30, available: true });
  }
  const { error: sizesError } = await supabase.from('product_sizes').upsert(sizes, { ignoreDuplicates: true });
  if (sizesError) throw new Error(`Product sizes seed failed: ${sizesError.message}`);
  console.log(`  ✓ ${products.length} products with sizes`);
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
