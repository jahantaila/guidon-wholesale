/**
 * Data access layer for Guidon Brewing Co. Wholesale.
 *
 * When NEXT_PUBLIC_SUPABASE_URL is configured (not a placeholder), all reads and
 * writes go to Supabase.  Otherwise the app falls back to local JSON files so
 * development and demos work without a Supabase project.
 */

import fs from 'fs';
import path from 'path';
import type { Customer, Product, Order, OrderItem, Invoice, KegLedgerEntry, KegLedgerStatus, OrderTemplate, RecurringOrder, WholesaleApplication, KegSize, BrewSchedule, CrmContact, CrmActivity } from './types';
import { isSupabaseConfigured, createAdminClient } from './supabase';
import { formatAddress } from './utils';

// ─── File-based helpers ────────────────────────────────────────────────────────

const dataDir = path.join(process.cwd(), 'data');

/**
 * Reads a JSON collection from data/, returning `fallback` when the file does
 * not exist.
 *
 * A missing file is normal, not exceptional: this path only runs when Supabase
 * is unconfigured (local dev, CI), and not every entity ships a seed file.
 * `order-templates.json` and `recurring-orders.json` have never existed, so
 * those code paths threw ENOENT and 500'd in exactly that configuration —
 * which is how the CI e2e job runs the app.
 *
 * Every store in this file is a collection, so the default is an empty array.
 * A genuinely corrupt file still throws, because silently returning [] for
 * malformed JSON would hide real data loss.
 */
function readJSON<T>(filename: string, fallback: T = [] as unknown as T): T {
  const filePath = path.join(dataDir, filename);
  let data: string;
  try {
    data = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return fallback;
    throw err;
  }
  return JSON.parse(data) as T;
}

function writeJSON<T>(filename: string, data: T): void {
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Supabase row-to-model mappers ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCustomer(row: any): Customer {
  // Split-address columns are the source of truth. Pre-migration rows have
  // them empty but `address` populated — surface that legacy value as
  // streetAddress so we don't lose data until admin re-edits.
  const street = (row.street_address || '') as string;
  const city = (row.city || '') as string;
  const state = (row.state || '') as string;
  const zip = (row.zip || '') as string;
  const legacy = (row.address || '') as string;
  const hasSplit = Boolean(street || city || state || zip);
  const ppm = row.preferred_payment_method;
  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    streetAddress: hasSplit ? street : legacy,
    city,
    state,
    zip,
    abcPermitNumber: row.abc_permit_number ?? '',
    customerIdentification: row.customer_identification ?? '',
    preferredPaymentMethod:
      ppm === 'check' || ppm === 'fintech' ? ppm : 'no_preference',
    notes: row.notes ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    autoSendInvoices: row.auto_send_invoices === true,
    archivedAt: row.archived_at ?? null,
    mustChangePassword: row.must_change_password === true,
    nextFollowupDate: row.next_followup_date ?? null,
    nextFollowupNotes: row.next_followup_notes ?? '',
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    style: row.style,
    abv: row.abv,
    ibu: row.ibu ?? undefined,
    description: row.description,
    category: row.category,
    available: row.available,
    imageUrl: row.image_url ?? undefined,
    awards: Array.isArray(row.awards) ? row.awards : [],
    newRelease: row.new_release ?? false,
    limitedRelease: row.limited_release ?? false,
    sortOrder: row.sort_order ?? null,
    sizes: (row.product_sizes || [])
      .slice()
      .sort((a: { sort_order?: number | null }, b: { sort_order?: number | null }) => {
        const ao = a.sort_order ?? 999;
        const bo = b.sort_order ?? 999;
        return ao - bo;
      })
      .map((s: { size: string; price: number; deposit: number; inventory_count?: number; par_level?: number | null; available?: boolean; sort_order?: number | null }) => ({
        size: s.size,
        price: s.price,
        deposit: s.deposit,
        inventoryCount: s.inventory_count ?? 0,
        parLevel: s.par_level ?? null,
        available: s.available ?? true,
        sortOrder: s.sort_order ?? null,
      })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToOrder(row: any): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    items: (row.order_items || []).map((i: { product_id: string; product_name: string; size: string; quantity: number; unit_price: number; deposit: number }) => ({
      productId: i.product_id,
      productName: i.product_name,
      size: i.size,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      deposit: i.deposit,
    })),
    kegReturns: (row.keg_returns || []).map((r: { size: string; quantity: number }) => ({
      size: r.size,
      quantity: r.quantity,
    })),
    subtotal: row.subtotal,
    totalDeposit: row.total_deposit,
    total: row.total,
    deliveryDate: row.delivery_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToInvoice(row: any): Invoice {
  return {
    id: row.id,
    orderId: row.order_id,
    customerId: row.customer_id,
    status: row.status,
    items: row.items || [],
    subtotal: row.subtotal,
    totalDeposit: row.total_deposit,
    total: row.total,
    issuedAt: row.issued_at,
    sentAt: row.sent_at ?? null,
    paidAt: row.paid_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToKegEntry(row: any): KegLedgerEntry {
  return {
    id: row.id,
    customerId: row.customer_id,
    orderId: row.order_id,
    type: row.type,
    size: row.size,
    quantity: row.quantity,
    depositAmount: row.deposit_amount,
    totalAmount: row.total_amount,
    date: row.date,
    notes: row.notes,
    status: row.status ?? 'approved',
  };
}

/** Only 'approved' entries count toward the outstanding-keg balance. Pending
 * customer-initiated returns are visible in the ledger but don't subtract
 * until admin confirms the empties came back. */
export function countsTowardBalance(entry: Pick<KegLedgerEntry, 'status'>): boolean {
  return (entry.status ?? 'approved') === 'approved';
}

/** Pure reducer that turns a list of ledger entries into a per-size balance.
 * Exported for testability — the stateful getKegBalanceByCustomer /
 * getAllKegBalances functions above delegate here after fetching. */
export function computeKegBalance(entries: Pick<KegLedgerEntry, 'type' | 'size' | 'quantity' | 'status'>[]): Record<string, number> {
  const balance: Record<string, number> = { '1/2bbl': 0, '1/4bbl': 0, '1/6bbl': 0 };
  for (const entry of entries) {
    if (!countsTowardBalance(entry)) continue;
    if (!(entry.size in balance)) balance[entry.size] = 0;
    if (entry.type === 'deposit') {
      balance[entry.size] += entry.quantity;
    } else {
      balance[entry.size] -= entry.quantity;
    }
  }
  return balance;
}

// ─── Customers ─────────────────────────────────────────────────────────────────

/**
 * @param includeArchived defaults to false. Archived customers are soft-
 * deleted; they stay in the DB so historical orders/invoices are intact,
 * but admin dropdowns and default listings exclude them.
 */
export async function getCustomers(includeArchived: boolean = false): Promise<Customer[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const query = sb.from('customers').select('*').order('created_at');
    if (!includeArchived) query.is('archived_at', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(rowToCustomer);
  }
  const all = readJSON<Customer[]>('customers.json');
  return includeArchived ? all : all.filter((c) => !c.archivedAt);
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb.from('customers').select('*').eq('id', id).single();
    if (error) return undefined;
    return rowToCustomer(data);
  }
  return readJSON<Customer[]>('customers.json').find(c => c.id === id);
}

export async function createCustomer(customer: Customer): Promise<Customer> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb.from('customers').insert({
      id: customer.id,
      business_name: customer.businessName,
      contact_name: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      street_address: customer.streetAddress,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
      // Keep the legacy single-string column populated (joined) so any
      // consumer still reading `address` directly keeps working until the
      // column is dropped.
      address: formatAddress(customer),
      abc_permit_number: customer.abcPermitNumber || '',
      customer_identification: customer.customerIdentification || '',
      preferred_payment_method: customer.preferredPaymentMethod || 'no_preference',
      // Persist the force-change-password flag when the approval flow sets
      // it. Default of false in the DB handles the admin-creates-customer
      // path where no temp password is involved.
      must_change_password: customer.mustChangePassword === true,
    }).select().single();
    if (error) throw error;
    return rowToCustomer(data);
  }
  const customers = readJSON<Customer[]>('customers.json');
  customers.push(customer);
  writeJSON('customers.json', customers);
  return customer;
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const row: Record<string, unknown> = {};
    if (updates.businessName !== undefined) row.business_name = updates.businessName;
    if (updates.contactName !== undefined) row.contact_name = updates.contactName;
    if (updates.email !== undefined) row.email = updates.email;
    if (updates.phone !== undefined) row.phone = updates.phone;
    // Address: write any provided split fields, and re-derive the legacy
    // joined `address` column whenever ANY split piece changes so the
    // single-string fallback stays in sync.
    const addressTouched =
      updates.streetAddress !== undefined ||
      updates.city !== undefined ||
      updates.state !== undefined ||
      updates.zip !== undefined;
    if (updates.streetAddress !== undefined) row.street_address = updates.streetAddress;
    if (updates.city !== undefined) row.city = updates.city;
    if (updates.state !== undefined) row.state = updates.state;
    if (updates.zip !== undefined) row.zip = updates.zip;
    if (addressTouched) {
      // Need the merged view of the address to re-derive the joined string.
      // Fetch the existing row's split parts and overlay updates so a partial
      // update doesn't blank out the joined column.
      const { data: existing } = await sb
        .from('customers')
        .select('street_address, city, state, zip, address')
        .eq('id', id)
        .single();
      const merged = {
        streetAddress: updates.streetAddress ?? (existing?.street_address || ''),
        city: updates.city ?? (existing?.city || ''),
        state: updates.state ?? (existing?.state || ''),
        zip: updates.zip ?? (existing?.zip || ''),
      };
      row.address = formatAddress(merged);
    }
    if (updates.abcPermitNumber !== undefined) row.abc_permit_number = updates.abcPermitNumber;
    if (updates.customerIdentification !== undefined) row.customer_identification = updates.customerIdentification;
    if (updates.preferredPaymentMethod !== undefined) row.preferred_payment_method = updates.preferredPaymentMethod;
    if (updates.notes !== undefined) row.notes = updates.notes;
    if (updates.tags !== undefined) row.tags = updates.tags;
    if (updates.autoSendInvoices !== undefined) row.auto_send_invoices = updates.autoSendInvoices;
    if (updates.archivedAt !== undefined) row.archived_at = updates.archivedAt;
    // CRM follow-up fields. nextFollowupDate accepts '' from the form which we
    // normalize to null so the date column clears cleanly.
    if (updates.nextFollowupDate !== undefined) row.next_followup_date = updates.nextFollowupDate || null;
    if (updates.nextFollowupNotes !== undefined) row.next_followup_notes = updates.nextFollowupNotes;
    // must_change_password is tracked on the customer row so we can prompt
    // the user on login. Approval flow sets it true (temp password issued);
    // the change-password flow clears it.
    if (updates.mustChangePassword !== undefined) row.must_change_password = updates.mustChangePassword;
    // If the ONLY thing being updated is password (which lives in Supabase
    // Auth, not the customers table), `row` is empty and `.update({}).single()`
    // returns no rows — causing the route to 404 even though the caller
    // just wanted to rotate their password. Handle that by fetching the
    // existing row and returning it unchanged. The Supabase Auth sync in
    // the PUT route is what actually rotates the password.
    if (Object.keys(row).length === 0) {
      const { data: existing, error: fetchErr } = await sb
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchErr || !existing) return undefined;
      return rowToCustomer(existing);
    }
    const { data, error } = await sb.from('customers').update(row).eq('id', id).select().single();
    if (error) return undefined;
    return rowToCustomer(data);
  }
  const customers = readJSON<Customer[]>('customers.json');
  const index = customers.findIndex(c => c.id === id);
  if (index === -1) return undefined;
  customers[index] = { ...customers[index], ...updates };
  writeJSON('customers.json', customers);
  return customers[index];
}

export async function deleteCustomer(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('customers').delete().eq('id', id);
    if (error) {
      // Log the actual reason so server logs show whether it was FK, RLS,
      // missing row, etc. Return false so the route can return a 409.
      console.error('[deleteCustomer] supabase error:', error.message, error.details);
      return false;
    }
    return true;
  }
  const customers = readJSON<Customer[]>('customers.json');
  const filtered = customers.filter(c => c.id !== id);
  if (filtered.length === customers.length) return false;
  writeJSON('customers.json', filtered);
  return true;
}

// ─── Products ──────────────────────────────────────────────────────────────────

/**
 * Product display order: explicit sort_order ascending, then name.
 *
 * Sorting happens in application code, NOT in the SQL query, on purpose. If we
 * ordered by `sort_order` in the query and the column did not exist yet (a
 * pre-migration instance), the whole catalog query would throw and both the
 * admin table AND the customer order page would go blank. Reading the column as
 * `null` and sorting here means a missing column simply falls back to name
 * order — the same fail-soft posture `adjustProductInventory` takes on
 * `inventory_count`. NULL sorts last so new products land at the bottom.
 */
export function byProductDisplayOrder(a: Product, b: Product): number {
  const ao = a.sortOrder ?? Number.POSITIVE_INFINITY;
  const bo = b.sortOrder ?? Number.POSITIVE_INFINITY;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
}

export async function getProducts(): Promise<Product[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('products')
      .select('*, product_sizes(*)')
      .eq('available', true)
      .order('name');
    if (error) throw error;
    return (data || []).map(rowToProduct).sort(byProductDisplayOrder);
  }
  return readJSON<Product[]>('products.json').sort(byProductDisplayOrder);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('products')
      .select('*, product_sizes(*)')
      .eq('id', id)
      .single();
    if (error) return undefined;
    return rowToProduct(data);
  }
  return readJSON<Product[]>('products.json').find(p => p.id === id);
}

export async function getAllProducts(): Promise<Product[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('products')
      .select('*, product_sizes(*)')
      .order('name');
    if (error) throw error;
    return (data || []).map(rowToProduct).sort(byProductDisplayOrder);
  }
  return readJSON<Product[]>('products.json').sort(byProductDisplayOrder);
}

export async function createProduct(product: Product): Promise<Product> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const productRow: Record<string, unknown> = {
      id: product.id,
      name: product.name,
      style: product.style,
      abv: product.abv,
      description: product.description,
      category: product.category,
      available: product.available,
    };
    if (product.ibu !== undefined) productRow.ibu = product.ibu;
    if (product.imageUrl !== undefined) productRow.image_url = product.imageUrl;
    if (product.awards !== undefined) productRow.awards = product.awards;
    if (product.newRelease !== undefined) productRow.new_release = product.newRelease;
    if (product.limitedRelease !== undefined) productRow.limited_release = product.limitedRelease;
    const { error } = await sb.from('products').insert(productRow);
    if (error) throw error;
    for (let i = 0; i < product.sizes.length; i++) {
      const size = product.sizes[i];
      const sizeRow: Record<string, unknown> = {
        product_id: product.id,
        size: size.size,
        price: size.price,
        deposit: size.deposit,
        sort_order: i,
      };
      if (size.inventoryCount !== undefined) sizeRow.inventory_count = size.inventoryCount;
      if (size.available !== undefined) sizeRow.available = size.available;
      if (size.parLevel !== undefined) sizeRow.par_level = size.parLevel;
      const { error: sizeError } = await sb.from('product_sizes').insert(sizeRow);
      if (sizeError) throw sizeError;
    }
    return product;
  }
  const products = readJSON<Product[]>('products.json');
  products.push(product);
  writeJSON('products.json', products);
  return product;
}

export async function updateProduct(id: string, fields: Partial<Product>): Promise<Product | null> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const updateFields: Record<string, unknown> = {};
    if (fields.name !== undefined) updateFields.name = fields.name;
    if (fields.style !== undefined) updateFields.style = fields.style;
    if (fields.abv !== undefined) updateFields.abv = fields.abv;
    if (fields.ibu !== undefined) updateFields.ibu = fields.ibu;
    if (fields.description !== undefined) updateFields.description = fields.description;
    if (fields.category !== undefined) updateFields.category = fields.category;
    if (fields.available !== undefined) updateFields.available = fields.available;
    if (fields.imageUrl !== undefined) updateFields.image_url = fields.imageUrl;
    if (fields.awards !== undefined) updateFields.awards = fields.awards;
    if (fields.newRelease !== undefined) updateFields.new_release = fields.newRelease;
    if (fields.limitedRelease !== undefined) updateFields.limited_release = fields.limitedRelease;
    if (fields.sortOrder !== undefined) updateFields.sort_order = fields.sortOrder;
    if (Object.keys(updateFields).length > 0) {
      const { error } = await sb.from('products').update(updateFields).eq('id', id);
      if (error) throw error;
    }
    if (fields.sizes) {
      await sb.from('product_sizes').delete().eq('product_id', id);
      for (let i = 0; i < fields.sizes.length; i++) {
        const size = fields.sizes[i];
        const sizeRow: Record<string, unknown> = {
          product_id: id,
          size: size.size,
          price: size.price,
          deposit: size.deposit,
          sort_order: i,
        };
        if (size.inventoryCount !== undefined) sizeRow.inventory_count = size.inventoryCount;
        if (size.available !== undefined) sizeRow.available = size.available;
        if (size.parLevel !== undefined) sizeRow.par_level = size.parLevel;
        const { error: sizeError } = await sb.from('product_sizes').insert(sizeRow);
        if (sizeError) throw sizeError;
      }
    }
    const updated = await getProduct(id);
    return updated || null;
  }
  const products = readJSON<Product[]>('products.json');
  const idx = products.findIndex(p => p.id === id);
  if (idx === -1) return null;
  products[idx] = { ...products[idx], ...fields };
  writeJSON('products.json', products);
  return products[idx];
}

/**
 * Adjust inventory for a specific product+size. Accepts a delta (positive to
 * restock, negative to consume). Returns the new inventory count, or null if
 * the product/size doesn't exist. Used by the order confirmation flow to
 * decrement kegs when an order is confirmed and the inventory_count column
 * exists in the DB.
 */
export async function adjustProductInventory(
  productId: string,
  size: KegSize,
  delta: number,
): Promise<number | null> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('product_sizes')
      .select('id, inventory_count')
      .eq('product_id', productId)
      .eq('size', size)
      .maybeSingle();
    if (error) {
      // If the column doesn't exist yet (pre-migration), skip silently.
      if (/inventory_count/.test(error.message)) return null;
      throw error;
    }
    if (!data) return null;
    const current = (data as { inventory_count?: number }).inventory_count ?? 0;
    const next = Math.max(0, current + delta);
    const { error: updErr } = await sb
      .from('product_sizes')
      .update({ inventory_count: next })
      .eq('id', (data as { id: string }).id);
    if (updErr) {
      if (/inventory_count/.test(updErr.message)) return null;
      throw updErr;
    }
    return next;
  }
  // File-based fallback
  const products = readJSON<Product[]>('products.json');
  const prod = products.find((p) => p.id === productId);
  if (!prod) return null;
  const sizeEntry = prod.sizes.find((s) => s.size === size);
  if (!sizeEntry) return null;
  sizeEntry.inventoryCount = Math.max(0, (sizeEntry.inventoryCount ?? 0) + delta);
  writeJSON('products.json', products);
  return sizeEntry.inventoryCount;
}

/**
 * Set absolute inventory count for a product+size. Used by admin manual
 * adjustments. Returns the saved count, or null if product/size missing.
 */
export async function setProductInventory(
  productId: string,
  size: KegSize,
  count: number,
): Promise<number | null> {
  const safeCount = Math.max(0, Math.floor(count));
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb
      .from('product_sizes')
      .update({ inventory_count: safeCount })
      .eq('product_id', productId)
      .eq('size', size);
    if (error) {
      if (/inventory_count/.test(error.message)) return null;
      throw error;
    }
    return safeCount;
  }
  const products = readJSON<Product[]>('products.json');
  const prod = products.find((p) => p.id === productId);
  if (!prod) return null;
  const sizeEntry = prod.sizes.find((s) => s.size === size);
  if (!sizeEntry) return null;
  sizeEntry.inventoryCount = safeCount;
  writeJSON('products.json', products);
  return safeCount;
}

/**
 * Persist a new product display order. `orderedIds` is the full list of product
 * ids in the order the admin dragged them into; each product's sort_order is
 * set to its index. Small catalog, so a per-row update loop is fine and avoids
 * needing a bulk-upsert helper.
 *
 * If the sort_order column doesn't exist yet (pre-migration), the first update
 * errors on it and we no-op rather than throw — the reorder simply doesn't
 * stick until the migration runs, but nothing else breaks.
 */
export async function reorderProducts(orderedIds: string[]): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await sb.from('products').update({ sort_order: i }).eq('id', orderedIds[i]);
      if (error) {
        if (/sort_order/.test(error.message)) return;
        throw error;
      }
    }
    return;
  }
  const products = readJSON<Product[]>('products.json');
  const indexById = new Map(orderedIds.map((id, i) => [id, i] as const));
  for (const p of products) {
    const idx = indexById.get(p.id);
    if (idx !== undefined) p.sortOrder = idx;
  }
  writeJSON('products.json', products);
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
  }
  const products = readJSON<Product[]>('products.json');
  const filtered = products.filter(p => p.id !== id);
  if (filtered.length === products.length) return false;
  writeJSON('products.json', filtered);
  return true;
}

// ─── Orders ────────────────────────────────────────────────────────────────────

export async function getOrders(): Promise<Order[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('orders')
      .select('*, order_items(*), keg_returns(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToOrder);
  }
  return readJSON<Order[]>('orders.json');
}

export async function getOrder(id: string): Promise<Order | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('orders')
      .select('*, order_items(*), keg_returns(*)')
      .eq('id', id)
      .single();
    if (error) return undefined;
    return rowToOrder(data);
  }
  return readJSON<Order[]>('orders.json').find(o => o.id === id);
}

export async function createOrder(order: Order): Promise<Order> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error: orderErr } = await sb.from('orders').insert({
      id: order.id,
      customer_id: order.customerId,
      status: order.status,
      subtotal: order.subtotal,
      total_deposit: order.totalDeposit,
      total: order.total,
      delivery_date: order.deliveryDate,
      notes: order.notes,
    });
    if (orderErr) throw orderErr;

    if (order.items.length > 0) {
      const { error: itemsErr } = await sb.from('order_items').insert(
        order.items.map(i => ({
          order_id: order.id,
          product_id: i.productId,
          product_name: i.productName,
          size: i.size,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          deposit: i.deposit,
        }))
      );
      if (itemsErr) throw itemsErr;
    }

    if (order.kegReturns.length > 0) {
      const { error: retErr } = await sb.from('keg_returns').insert(
        order.kegReturns.map(r => ({ order_id: order.id, size: r.size, quantity: r.quantity }))
      );
      if (retErr) throw retErr;
    }

    return order;
  }
  const orders = readJSON<Order[]>('orders.json');
  orders.push(order);
  writeJSON('orders.json', orders);
  return order;
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<Order | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const row: Record<string, unknown> = {};
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.deliveryDate !== undefined) row.delivery_date = updates.deliveryDate;
    if (updates.notes !== undefined) row.notes = updates.notes;
    // Totals are recomputed by the caller (admin item edits) and written here.
    if (updates.subtotal !== undefined) row.subtotal = updates.subtotal;
    if (updates.totalDeposit !== undefined) row.total_deposit = updates.totalDeposit;
    if (updates.total !== undefined) row.total = updates.total;

    if (Object.keys(row).length > 0) {
      const { error } = await sb.from('orders').update(row).eq('id', id);
      if (error) return undefined;
    }

    // Replace line items when the caller supplies a new array. Full
    // delete + reinsert mirrors updateProduct's handling of product_sizes:
    // no diff to maintain, and an order's item count is tiny. Only runs when
    // `items` is explicitly provided, so a plain status change never touches
    // the line items.
    if (updates.items !== undefined) {
      const { error: delErr } = await sb.from('order_items').delete().eq('order_id', id);
      if (delErr) return undefined;
      if (updates.items.length > 0) {
        const { error: insErr } = await sb.from('order_items').insert(
          updates.items.map((i) => ({
            order_id: id,
            product_id: i.productId,
            product_name: i.productName,
            size: i.size,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            deposit: i.deposit,
          })),
        );
        if (insErr) return undefined;
      }
    }

    if (updates.kegReturns !== undefined) {
      const { error: delErr } = await sb.from('keg_returns').delete().eq('order_id', id);
      if (delErr) return undefined;
      if (updates.kegReturns.length > 0) {
        const { error: insErr } = await sb.from('keg_returns').insert(
          updates.kegReturns.map((r) => ({ order_id: id, size: r.size, quantity: r.quantity })),
        );
        if (insErr) return undefined;
      }
    }

    return getOrder(id);
  }
  const orders = readJSON<Order[]>('orders.json');
  const index = orders.findIndex(o => o.id === id);
  if (index === -1) return undefined;
  orders[index] = { ...orders[index], ...updates };
  writeJSON('orders.json', orders);
  return orders[index];
}

/**
 * Remove the auto-posted keg DEPOSIT rows for one order. Used when an admin
 * edits a confirmed order's items — the deposits are then rebuilt from the new
 * items so the customer's outstanding-keg balance stays exactly right.
 *
 * Scoped to `type = 'deposit'` AND this order id. Manual returns are recorded
 * with orderId '' (see /api/keg-ledger), so they are never in range; neither
 * are deposits belonging to any other order.
 */
export async function deleteOrderKegDeposits(orderId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb
      .from('keg_ledger')
      .delete()
      .eq('order_id', orderId)
      .eq('type', 'deposit');
    if (error) throw error;
    return;
  }
  const ledger = readJSON<KegLedgerEntry[]>('keg-ledger.json');
  const next = ledger.filter((e) => !(e.orderId === orderId && e.type === 'deposit'));
  writeJSON('keg-ledger.json', next);
}

// ─── Invoices ──────────────────────────────────────────────────────────────────

export async function getInvoices(): Promise<Invoice[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('invoices')
      .select('*')
      .order('issued_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToInvoice);
  }
  return readJSON<Invoice[]>('invoices.json');
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb.from('invoices').select('*').eq('id', id).single();
    if (error) return undefined;
    return rowToInvoice(data);
  }
  return readJSON<Invoice[]>('invoices.json').find(i => i.id === id);
}

export async function createInvoice(invoice: Invoice): Promise<Invoice> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('invoices').insert({
      id: invoice.id,
      order_id: invoice.orderId,
      customer_id: invoice.customerId,
      status: invoice.status,
      items: invoice.items,
      subtotal: invoice.subtotal,
      total_deposit: invoice.totalDeposit,
      total: invoice.total,
      issued_at: invoice.issuedAt,
      sent_at: invoice.sentAt ?? null,
      paid_at: invoice.paidAt,
    });
    if (error) throw error;
    return invoice;
  }
  const invoices = readJSON<Invoice[]>('invoices.json');
  invoices.push(invoice);
  writeJSON('invoices.json', invoices);
  return invoice;
}

export async function updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const row: Record<string, unknown> = {};
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.paidAt !== undefined) row.paid_at = updates.paidAt;
    if (updates.sentAt !== undefined) row.sent_at = updates.sentAt;
    // Line items + money columns, so an admin order edit can keep the linked
    // invoice in sync. items is a jsonb snapshot on the invoice row.
    if (updates.items !== undefined) row.items = updates.items;
    if (updates.subtotal !== undefined) row.subtotal = updates.subtotal;
    if (updates.totalDeposit !== undefined) row.total_deposit = updates.totalDeposit;
    if (updates.total !== undefined) row.total = updates.total;
    const { data, error } = await sb
      .from('invoices')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) return undefined;
    return rowToInvoice(data);
  }
  const invoices = readJSON<Invoice[]>('invoices.json');
  const index = invoices.findIndex(i => i.id === id);
  if (index === -1) return undefined;
  invoices[index] = { ...invoices[index], ...updates };
  writeJSON('invoices.json', invoices);
  return invoices[index];
}

// ─── Settings (admin-editable config) ─────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return fallback;
    return (data.value as T) ?? fallback;
  }
  try {
    const filePath = path.join(dataDir, 'settings.json');
    if (!fs.existsSync(filePath)) return fallback;
    const all = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    return (all[key] as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return;
  }
  const filePath = path.join(dataDir, 'settings.json');
  let all: Record<string, unknown> = {};
  try {
    if (fs.existsSync(filePath)) {
      all = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // start fresh on parse error
  }
  all[key] = value;
  writeJSON('settings.json', all);
}

export async function getNotificationEmails(): Promise<string[]> {
  const fallback = process.env.EMAIL_ADMIN
    ? process.env.EMAIL_ADMIN.split(',').map((s) => s.trim()).filter(Boolean)
    : ['sales@guidonbrewing.com'];
  const saved = await getSetting<string[]>('notification_emails', fallback);
  return Array.isArray(saved) && saved.length > 0 ? saved : fallback;
}

// ─── Wholesale Alerts ─────────────────────────────────────────────────────────

const ALERT_SETTINGS_KEY = 'wholesale_alert';

/**
 * Default alert seeded into the system: the keg-price-increase notice the
 * brewery launched on 2026-05-15. Originally hardcoded into the portal popup
 * with a 2026-06-05 expiry; on 2026-05-20 the brewery asked for "3 more
 * weeks," so the seed expiry moves to 2026-06-26.
 *
 * Returned by getAlert() ONLY when no admin-saved record exists. The moment
 * the admin saves anything via /admin/alerts (even to disable), that saved
 * record takes over — the seed is just a transition shim so the popup keeps
 * displaying through the deploy without manual intervention.
 */
const DEFAULT_ALERT_SEED: import('./types').WholesaleAlert = {
  id: 'price-increase-2026-05',
  title: 'Keg Price Update',
  body: 'We’ve increased our keg prices effective immediately. Updated pricing is reflected on every product when you browse the catalog.\n\nThanks for continuing to carry Guidon. Reach out to the brewery directly with any questions.',
  active: true,
  endsAt: '2026-06-26',
  updatedAt: '2026-05-20T00:00:00.000Z',
};

export async function getAlert(): Promise<import('./types').WholesaleAlert | null> {
  const saved = await getSetting<import('./types').WholesaleAlert | null>(
    ALERT_SETTINGS_KEY,
    null,
  );
  if (saved && typeof saved === 'object' && 'id' in saved) return saved;
  // No admin-saved record — fall through to the seed so customers don't lose
  // the in-flight price-increase popup the moment this code deploys.
  // Suppress the seed once its own end date passes so the seed doesn't
  // resurrect itself indefinitely.
  if (DEFAULT_ALERT_SEED.endsAt && Date.now() > new Date(DEFAULT_ALERT_SEED.endsAt).getTime()) {
    return null;
  }
  return DEFAULT_ALERT_SEED;
}

export async function setAlert(alert: import('./types').WholesaleAlert): Promise<void> {
  await setSetting(ALERT_SETTINGS_KEY, alert);
}

// ─── Keg Ledger ────────────────────────────────────────────────────────────────

export async function getKegLedger(): Promise<KegLedgerEntry[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('keg_ledger')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToKegEntry);
  }
  return readJSON<KegLedgerEntry[]>('keg-ledger.json');
}

export async function addKegLedgerEntry(entry: KegLedgerEntry): Promise<KegLedgerEntry> {
  const status: KegLedgerStatus = entry.status ?? 'approved';
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('keg_ledger').insert({
      id: entry.id,
      customer_id: entry.customerId,
      order_id: entry.orderId,
      type: entry.type,
      size: entry.size,
      quantity: entry.quantity,
      deposit_amount: entry.depositAmount,
      total_amount: entry.totalAmount,
      date: entry.date,
      notes: entry.notes,
      status,
    });
    if (error) throw error;
    return { ...entry, status };
  }
  const ledger = readJSON<KegLedgerEntry[]>('keg-ledger.json');
  const row = { ...entry, status };
  ledger.push(row);
  writeJSON('keg-ledger.json', ledger);
  return row;
}

export async function getKegLedgerByCustomer(customerId: string): Promise<KegLedgerEntry[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('keg_ledger')
      .select('*')
      .eq('customer_id', customerId)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToKegEntry);
  }
  return readJSON<KegLedgerEntry[]>('keg-ledger.json').filter(e => e.customerId === customerId);
}

export async function getKegBalanceByCustomer(customerId: string): Promise<Record<string, number>> {
  const entries = await getKegLedgerByCustomer(customerId);
  return computeKegBalance(entries);
}

export async function getAllKegBalances(): Promise<Record<string, Record<string, number>>> {
  const ledger = await getKegLedger();
  const byCustomer = new Map<string, KegLedgerEntry[]>();
  for (const entry of ledger) {
    if (!byCustomer.has(entry.customerId)) byCustomer.set(entry.customerId, []);
    byCustomer.get(entry.customerId)!.push(entry);
  }
  const result: Record<string, Record<string, number>> = {};
  byCustomer.forEach((entries, customerId) => {
    result[customerId] = computeKegBalance(entries);
  });
  return result;
}

// ─── Wholesale Applications ────────────────────────────────────────────────────

export async function getApplications(): Promise<WholesaleApplication[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb.from('applications').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => {
      // Mirror rowToCustomer: prefer split columns, fall back to legacy
      // joined `address` for pre-migration rows so we don't lose data.
      const street = (row.street_address as string) || '';
      const city = (row.city as string) || '';
      const state = (row.state as string) || '';
      const zip = (row.zip as string) || '';
      const legacy = (row.address as string) || '';
      const hasSplit = Boolean(street || city || state || zip);
      return {
        id: row.id as string,
        businessName: row.business_name as string,
        contactName: row.contact_name as string,
        email: row.email as string,
        phone: row.phone as string,
        streetAddress: hasSplit ? street : legacy,
        city,
        state,
        zip,
        abcPermitNumber: (row.abc_permit_number as string) || '',
        businessType: (row.business_type as string) || '',
        expectedMonthlyVolume: (row.expected_monthly_volume as string) || '',
        preferredPaymentMethod:
          (row.preferred_payment_method as 'check' | 'fintech' | 'no_preference') || 'no_preference',
        // CRITICAL: without this, the admin applications page sees every row
        // as having no status and treats them all as pending, so approved /
        // rejected apps never leave the Pending (N) section — the bug users
        // kept flagging as "approve doesn't work".
        status: (row.status as 'pending' | 'approved' | 'rejected') || 'pending',
        createdAt: row.created_at as string,
      };
    });
  }
  return readJSON<WholesaleApplication[]>('applications.json');
}

export async function createApplication(app: WholesaleApplication): Promise<WholesaleApplication> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('applications').insert({
      id: app.id,
      business_name: app.businessName,
      contact_name: app.contactName,
      email: app.email,
      phone: app.phone,
      street_address: app.streetAddress,
      city: app.city,
      state: app.state,
      zip: app.zip,
      // Keep legacy single-string column populated for any consumer still
      // reading it (admin view, email, etc. that haven't migrated).
      address: formatAddress(app),
      abc_permit_number: app.abcPermitNumber,
      message: '',
      business_type: app.businessType || '',
      expected_monthly_volume: app.expectedMonthlyVolume || '',
      preferred_payment_method: app.preferredPaymentMethod || 'no_preference',
    });
    if (error) throw error;
    return app;
  }
  const apps = readJSON<WholesaleApplication[]>('applications.json');
  apps.push(app);
  writeJSON('applications.json', apps);
  return app;
}

export async function updateApplication(id: string, status: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('applications').update({ status }).eq('id', id);
    if (error) throw error;
    return true;
  }
  const apps = readJSON<WholesaleApplication[]>('applications.json');
  const idx = apps.findIndex(a => a.id === id);
  if (idx === -1) return false;
  apps[idx] = { ...apps[idx], status: status as WholesaleApplication['status'] };
  writeJSON('applications.json', apps);
  return true;
}

// ─── Order Templates ───────────────────────────────────────────────────────────

export async function getOrderTemplates(customerId: string): Promise<OrderTemplate[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('order_templates')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      items: row.items || [],
      createdAt: row.created_at,
    }));
  }
  return readJSON<OrderTemplate[]>('order-templates.json').filter((t) => t.customerId === customerId);
}

export async function createOrderTemplate(template: OrderTemplate): Promise<OrderTemplate> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('order_templates').insert({
      id: template.id,
      customer_id: template.customerId,
      name: template.name,
      items: template.items,
    });
    if (error) throw error;
    return template;
  }
  const all = readJSON<OrderTemplate[]>('order-templates.json');
  all.push(template);
  writeJSON('order-templates.json', all);
  return template;
}

export async function deleteOrderTemplate(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('order_templates').delete().eq('id', id);
    return !error;
  }
  const all = readJSON<OrderTemplate[]>('order-templates.json');
  const next = all.filter((t) => t.id !== id);
  if (next.length === all.length) return false;
  writeJSON('order-templates.json', next);
  return true;
}

// ─── Recurring Orders ──────────────────────────────────────────────────────────

function rowToRecurring(row: Record<string, unknown>): RecurringOrder {
  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    name: row.name as string,
    items: (row.items as OrderItem[]) || [],
    intervalDays: row.interval_days as number,
    nextRunAt: row.next_run_at as string,
    active: row.active as boolean,
    headsUpSentAt: (row.heads_up_sent_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function getRecurringOrders(customerId?: string): Promise<RecurringOrder[]> {
  // An EXPLICIT empty string means "a caller with no customer identity" and
  // must match nothing. Only `undefined` means "unfiltered, admin view".
  // Without this, `getRecurringOrders('')` fell through to the no-filter
  // branch and returned every row, which turned the ownership check in the
  // PUT route into a full table read: an anonymous caller could switch off
  // any customer's standing order. The route guards this too; keeping it
  // here means the next caller can't reintroduce the same hole.
  if (customerId === '') return [];
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const query = sb.from('recurring_orders').select('*').order('created_at', { ascending: false });
    if (customerId) query.eq('customer_id', customerId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(rowToRecurring);
  }
  const all = readJSON<RecurringOrder[]>('recurring-orders.json');
  return customerId ? all.filter((r) => r.customerId === customerId) : all;
}

/**
 * Recurring orders whose next_run_at is within the next `hours` AND
 * heads_up_sent_at is null. Used by the daily cron to send 24h heads-up
 * emails once per cycle.
 */
export async function getUpcomingRecurringOrders(hours: number): Promise<RecurringOrder[]> {
  const cutoff = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('recurring_orders')
      .select('*')
      .eq('active', true)
      .is('heads_up_sent_at', null)
      .gt('next_run_at', now)
      .lte('next_run_at', cutoff);
    if (error) throw error;
    return (data || []).map(rowToRecurring);
  }
  return readJSON<RecurringOrder[]>('recurring-orders.json').filter(
    (r) => r.active && !r.headsUpSentAt && r.nextRunAt > now && r.nextRunAt <= cutoff,
  );
}

export async function getDueRecurringOrders(): Promise<RecurringOrder[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('recurring_orders')
      .select('*')
      .eq('active', true)
      .lte('next_run_at', new Date().toISOString());
    if (error) throw error;
    return (data || []).map(rowToRecurring);
  }
  return readJSON<RecurringOrder[]>('recurring-orders.json').filter(
    (r) => r.active && new Date(r.nextRunAt) <= new Date(),
  );
}

export async function createRecurringOrder(rec: RecurringOrder): Promise<RecurringOrder> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('recurring_orders').insert({
      id: rec.id,
      customer_id: rec.customerId,
      name: rec.name,
      items: rec.items,
      interval_days: rec.intervalDays,
      next_run_at: rec.nextRunAt,
      active: rec.active,
    });
    if (error) throw error;
    return rec;
  }
  const all = readJSON<RecurringOrder[]>('recurring-orders.json');
  all.push(rec);
  writeJSON('recurring-orders.json', all);
  return rec;
}

export async function updateRecurringOrder(id: string, updates: Partial<RecurringOrder>): Promise<RecurringOrder | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const row: Record<string, unknown> = {};
    if (updates.active !== undefined) row.active = updates.active;
    if (updates.nextRunAt !== undefined) row.next_run_at = updates.nextRunAt;
    if (updates.intervalDays !== undefined) row.interval_days = updates.intervalDays;
    if (updates.name !== undefined) row.name = updates.name;
    if (updates.items !== undefined) row.items = updates.items;
    if (updates.headsUpSentAt !== undefined) row.heads_up_sent_at = updates.headsUpSentAt;
    const { data, error } = await sb.from('recurring_orders').update(row).eq('id', id).select().single();
    if (error) return undefined;
    return rowToRecurring(data);
  }
  const all = readJSON<RecurringOrder[]>('recurring-orders.json');
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], ...updates };
  writeJSON('recurring-orders.json', all);
  return all[idx];
}

export async function deleteRecurringOrder(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('recurring_orders').delete().eq('id', id);
    return !error;
  }
  const all = readJSON<RecurringOrder[]>('recurring-orders.json');
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  writeJSON('recurring-orders.json', next);
  return true;
}

// ─── Brew Schedule ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToBrew(row: any): BrewSchedule {
  return {
    id: row.id,
    productId: row.product_id,
    size: row.size,
    brewDate: row.brew_date,
    expectedYield: row.expected_yield ?? 0,
    completedAt: row.completed_at ?? null,
    notes: row.notes ?? '',
    createdAt: row.created_at,
  };
}

/** @param includeCompleted defaults to false. Omits past brews by default. */
export async function getBrewSchedule(includeCompleted = false): Promise<BrewSchedule[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const query = sb.from('brew_schedule').select('*').order('brew_date', { ascending: true });
    if (!includeCompleted) query.is('completed_at', null);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(rowToBrew);
  }
  return [];
}

export async function createBrewSchedule(entry: BrewSchedule): Promise<BrewSchedule> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb.from('brew_schedule').insert({
      id: entry.id,
      product_id: entry.productId,
      size: entry.size,
      brew_date: entry.brewDate,
      expected_yield: entry.expectedYield,
      notes: entry.notes ?? '',
    }).select().single();
    if (error) throw error;
    return rowToBrew(data);
  }
  return entry;
}

export async function updateBrewSchedule(id: string, updates: Partial<BrewSchedule>): Promise<BrewSchedule | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const row: Record<string, unknown> = {};
    if (updates.productId !== undefined) row.product_id = updates.productId;
    if (updates.size !== undefined) row.size = updates.size;
    if (updates.brewDate !== undefined) row.brew_date = updates.brewDate;
    if (updates.expectedYield !== undefined) row.expected_yield = updates.expectedYield;
    if (updates.completedAt !== undefined) row.completed_at = updates.completedAt;
    if (updates.notes !== undefined) row.notes = updates.notes;
    if (Object.keys(row).length === 0) return undefined;
    const { data, error } = await sb.from('brew_schedule').update(row).eq('id', id).select().single();
    if (error) return undefined;
    return rowToBrew(data);
  }
  return undefined;
}

export async function deleteBrewSchedule(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('brew_schedule').delete().eq('id', id);
    return !error;
  }
  return false;
}

// ─── CRM: leads/prospects + contact activity ─────────────────────────────────

/**
 * True when a Supabase error means "that table does not exist yet".
 *
 * The CRM tables are created by `bun run migrate`, which needs a
 * SUPABASE_ACCESS_TOKEN that is not always configured. Until it runs, CRM
 * READS degrade to empty rather than 500 the whole admin panel. WRITES still
 * surface the error, because silently swallowing a lead Mike just typed is
 * worse than showing him a failure.
 */
function isMissingTableError(err: unknown): boolean {
  if (!err) return false;
  // Supabase rejects with a PLAIN OBJECT, not an Error instance, so
  // `String(err)` yields "[object Object]" and matching on that silently
  // fails. Check the structured code first, then the message.
  //   PGRST205 = PostgREST "table not found in schema cache"
  //   42P01    = Postgres undefined_table
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST205' || e.code === '42P01') return true;
  const msg =
    typeof e.message === 'string'
      ? e.message
      : err instanceof Error
        ? err.message
        : String(err);
  return /42P01|PGRST205|does not exist|schema cache/i.test(msg);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCrmContact(row: any): CrmContact {
  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    streetAddress: row.street_address ?? '',
    city: row.city ?? '',
    state: row.state ?? '',
    zip: row.zip ?? '',
    status: row.status === 'prospect' ? 'prospect' : 'lead',
    notes: row.notes ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    nextFollowupDate: row.next_followup_date ?? null,
    nextFollowupNotes: row.next_followup_notes ?? '',
    convertedCustomerId: row.converted_customer_id ?? null,
    convertedAt: row.converted_at ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCrmActivity(row: any): CrmActivity {
  return {
    id: row.id,
    customerId: row.customer_id ?? null,
    contactId: row.contact_id ?? null,
    type: row.type,
    occurredAt: row.occurred_at,
    notes: row.notes ?? '',
    source: row.source === 'system' ? 'system' : 'admin',
    createdAt: row.created_at,
  };
}

export async function getCrmContacts(includeArchived = false): Promise<CrmContact[]> {
  if (isSupabaseConfigured()) {
    try {
      const sb = createAdminClient();
      const query = sb.from('crm_contacts').select('*').order('created_at', { ascending: false });
      if (!includeArchived) query.is('archived_at', null);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(rowToCrmContact);
    } catch (err) {
      if (isMissingTableError(err)) {
        console.warn('[crm] crm_contacts table missing — run `bun run migrate`.');
        return [];
      }
      throw err;
    }
  }
  const all = readJSON<CrmContact[]>('crm-contacts.json');
  return includeArchived ? all : all.filter((c) => !c.archivedAt);
}

export async function getCrmContact(id: string): Promise<CrmContact | undefined> {
  return (await getCrmContacts(true)).find((c) => c.id === id);
}

export async function createCrmContact(contact: CrmContact): Promise<CrmContact> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('crm_contacts')
      .insert({
        id: contact.id,
        business_name: contact.businessName,
        contact_name: contact.contactName,
        email: contact.email,
        phone: contact.phone,
        street_address: contact.streetAddress,
        city: contact.city,
        state: contact.state,
        zip: contact.zip,
        status: contact.status,
        notes: contact.notes,
        tags: contact.tags,
        next_followup_date: contact.nextFollowupDate || null,
        next_followup_notes: contact.nextFollowupNotes,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToCrmContact(data);
  }
  const all = readJSON<CrmContact[]>('crm-contacts.json');
  all.push(contact);
  writeJSON('crm-contacts.json', all);
  return contact;
}

export async function updateCrmContact(
  id: string,
  updates: Partial<CrmContact>,
): Promise<CrmContact | undefined> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const row: Record<string, unknown> = {};
    if (updates.businessName !== undefined) row.business_name = updates.businessName;
    if (updates.contactName !== undefined) row.contact_name = updates.contactName;
    if (updates.email !== undefined) row.email = updates.email;
    if (updates.phone !== undefined) row.phone = updates.phone;
    if (updates.streetAddress !== undefined) row.street_address = updates.streetAddress;
    if (updates.city !== undefined) row.city = updates.city;
    if (updates.state !== undefined) row.state = updates.state;
    if (updates.zip !== undefined) row.zip = updates.zip;
    if (updates.status !== undefined) row.status = updates.status;
    if (updates.notes !== undefined) row.notes = updates.notes;
    if (updates.tags !== undefined) row.tags = updates.tags;
    if (updates.nextFollowupDate !== undefined) row.next_followup_date = updates.nextFollowupDate || null;
    if (updates.nextFollowupNotes !== undefined) row.next_followup_notes = updates.nextFollowupNotes;
    if (updates.convertedCustomerId !== undefined) row.converted_customer_id = updates.convertedCustomerId;
    if (updates.convertedAt !== undefined) row.converted_at = updates.convertedAt;
    if (updates.archivedAt !== undefined) row.archived_at = updates.archivedAt;
    if (Object.keys(row).length === 0) return getCrmContact(id);
    const { data, error } = await sb.from('crm_contacts').update(row).eq('id', id).select().single();
    if (error) return undefined;
    return rowToCrmContact(data);
  }
  const all = readJSON<CrmContact[]>('crm-contacts.json');
  const i = all.findIndex((c) => c.id === id);
  if (i === -1) return undefined;
  all[i] = { ...all[i], ...updates };
  writeJSON('crm-contacts.json', all);
  return all[i];
}

/**
 * Hard-delete a lead/prospect. Its logged activities are removed FIRST.
 *
 * The crm_activities.contact_id FK is ON DELETE SET NULL, but the row also has
 * a check constraint requiring exactly one of (customer_id, contact_id) to be
 * non-null. A plain contact delete would try to null contact_id on its
 * activities and trip that check, failing the delete. Clearing the activities
 * up front avoids it — and is the right behavior anyway: discarding a lead
 * discards its touch history. (Converted leads have already had their history
 * re-parented onto the customer, so this never touches a customer's log.)
 */
export async function deleteCrmContact(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error: actErr } = await sb.from('crm_activities').delete().eq('contact_id', id);
    if (actErr) throw actErr;
    const { error } = await sb.from('crm_contacts').delete().eq('id', id);
    if (error) {
      console.error('[deleteCrmContact] supabase error:', error.message, error.details);
      return false;
    }
    return true;
  }
  const contacts = readJSON<CrmContact[]>('crm-contacts.json');
  const filtered = contacts.filter((c) => c.id !== id);
  if (filtered.length === contacts.length) return false;
  writeJSON('crm-contacts.json', filtered);
  const activities = readJSON<CrmActivity[]>('crm-activities.json');
  writeJSON('crm-activities.json', activities.filter((a) => a.contactId !== id));
  return true;
}

export async function getCrmActivities(subjectId?: string): Promise<CrmActivity[]> {
  if (isSupabaseConfigured()) {
    try {
      const sb = createAdminClient();
      const query = sb.from('crm_activities').select('*').order('occurred_at', { ascending: false });
      if (subjectId) query.or(`customer_id.eq.${subjectId},contact_id.eq.${subjectId}`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(rowToCrmActivity);
    } catch (err) {
      if (isMissingTableError(err)) {
        console.warn('[crm] crm_activities table missing — run `bun run migrate`.');
        return [];
      }
      throw err;
    }
  }
  const all = readJSON<CrmActivity[]>('crm-activities.json');
  const rows = subjectId
    ? all.filter((a) => a.customerId === subjectId || a.contactId === subjectId)
    : all;
  return [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function createCrmActivity(activity: CrmActivity): Promise<CrmActivity> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('crm_activities')
      .insert({
        // id deliberately omitted: the column defaults to uuid_generate_v4().
        // generateId() is 6 random digits, which collides at roughly 42% by
        // 1,000 rows, and a PK violation would surface to Mike as "couldn't
        // log activity" with no explanation.
        customer_id: activity.customerId || null,
        contact_id: activity.contactId || null,
        type: activity.type,
        occurred_at: activity.occurredAt,
        notes: activity.notes,
        source: activity.source,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToCrmActivity(data);
  }
  const all = readJSON<CrmActivity[]>('crm-activities.json');
  all.push(activity);
  writeJSON('crm-activities.json', all);
  return activity;
}

export async function deleteCrmActivity(id: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { error } = await sb.from('crm_activities').delete().eq('id', id);
    return !error;
  }
  const all = readJSON<CrmActivity[]>('crm-activities.json');
  const next = all.filter((a) => a.id !== id);
  if (next.length === all.length) return false;
  writeJSON('crm-activities.json', next);
  return true;
}
