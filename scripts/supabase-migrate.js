/**
 * Supabase migration runner for Guidon Wholesale.
 *
 * Reads SUPABASE_ACCESS_TOKEN (a Personal Access Token) from .env.local and
 * applies supabase/schema.sql against the project via the Supabase
 * Management API: POST /v1/projects/{ref}/database/query.
 *
 * Idempotent: schema.sql uses CREATE TABLE IF NOT EXISTS and ADD COLUMN IF
 * NOT EXISTS, so re-running this file is safe.
 *
 * Usage:
 *   bun run migrate         (or)  node scripts/supabase-migrate.js
 *   bun run migrate:seed    (chains migrate -> setup-supabase.js)
 *
 * Get a token at: https://supabase.com/dashboard/account/tokens
 * Scope it to a single project if you like; the default (all-projects) is
 * fine for solo dev.
 */

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

const PAT = env['SUPABASE_ACCESS_TOKEN'];
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];

if (!PAT) {
  console.error('\nERROR: SUPABASE_ACCESS_TOKEN is not set in .env.local');
  console.error('');
  console.error('Get one at: https://supabase.com/dashboard/account/tokens');
  console.error('Then add to .env.local:');
  console.error('  SUPABASE_ACCESS_TOKEN=sbp_XXXXXXXXXXXXXXXX');
  console.error('');
  process.exit(1);
}

if (!SUPABASE_URL || SUPABASE_URL.includes('placeholder')) {
  console.error('\nERROR: NEXT_PUBLIC_SUPABASE_URL is not set in .env.local\n');
  process.exit(1);
}

// Extract the project ref from the URL: https://{ref}.supabase.co
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const MGMT_API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runSQL(sql, label) {
  const res = await fetch(MGMT_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[${label}] ${res.status} ${res.statusText}: ${text}`);
  }

  const data = await res.json().catch(() => ({}));
  return data;
}

async function main() {
  console.log(`\nConnecting to project: ${PROJECT_REF}`);
  console.log(`Management API: ${MGMT_API}\n`);

  const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
  const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');

  // Validate the token first with a trivial query so we fail fast on auth.
  try {
    await runSQL("select 'ok' as status", 'auth-check');
    console.log('  \u2713 Token authenticated');
  } catch (err) {
    if (String(err.message).includes('401') || String(err.message).includes('403')) {
      console.error('\nERROR: Token rejected. Check SUPABASE_ACCESS_TOKEN in .env.local');
      console.error('Generate a new one at https://supabase.com/dashboard/account/tokens\n');
      process.exit(1);
    }
    throw err;
  }

  console.log('\nApplying schema.sql...');
  await runSQL(schemaSQL, 'schema');
  console.log('  \u2713 Schema applied');

  // Spot-check the new columns landed.
  const sanity = await runSQL(
    `select
       (select count(*)::int from information_schema.columns
         where table_name = 'products' and column_name = 'ibu') as has_ibu,
       (select count(*)::int from information_schema.columns
         where table_name = 'products' and column_name = 'awards') as has_awards,
       (select count(*)::int from information_schema.columns
         where table_name = 'product_sizes' and column_name = 'inventory_count') as has_inventory;`,
    'sanity-check',
  );
  console.log('  \u2713 Column check:', JSON.stringify(sanity));

  console.log('\nMigration complete.\n');
  console.log('Next: run `node scripts/setup-supabase.js` to seed the real products');
  console.log('      with the now-available columns (ibu, awards, inventory_count).');
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
