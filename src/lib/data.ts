/**
 * Data access layer for Guidon Brewing Wholesale.
 *
 * When NEXT_PUBLIC_SUPABASE_URL is configured (not a placeholder), all reads and
 * writes go to Supabase.  Otherwise the app falls back to local JSON files so
 * development and demos work without a Supabase project.
 */

import fs from 'fs';
import path from 'path';
import type { Customer, Product, Order, Invoice, KegLedgerEntry, WholesaleApplication } from './types';
import { isSupabaseConfigured, createAdminClient } from './supabase';

// ─── File-based helpers ────────────────────────────────────────────────────────

const dataDir = path.join(process.cwd(), 'data');

function readJSON<T>(filename: string): T {
  const filePath = path.join(dataDir, filename);
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data) as T;
}

function writeJSON<T>(filename: string, data: T): void {
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Supabase row-to-model mappers ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCustomer(row: any): Customer {
  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
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
    description: row.description,
    category: row.category,
    available: row.available,
    sizes: (row.product_sizes || []).map((s: { size: string; price: number; deposit: number }) => ({
      size: s.size,
      price: s.price,
      deposit: s.deposit,
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
  };
}

// ─── Customers ─────────────────────────────────────────────────────────────────

export async function getCustomers(): Promise<Customer[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb.from('customers').select('*').order('created_at');
    if (error) throw error;
    return (data || []).map(rowToCustomer);
  }
  return readJSON<Customer[]>('customers.json');
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
      address: customer.address,
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
    if (updates.address !== undefined) row.address = updates.address;
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
    return !error;
  }
  const customers = readJSON<Customer[]>('customers.json');
  const filtered = customers.filter(c => c.id !== id);
  if (filtered.length === customers.length) return false;
  writeJSON('customers.json', filtered);
  return true;
}

// ─── Products ──────────────────────────────────────────────────────────────────

export async function getProducts(): Promise<Product[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from('products')
      .select('*, product_sizes(*)')
      .eq('available', true)
      .order('name');
    if (error) throw error;
    return (data || []).map(rowToProduct);
  }
  return readJSON<Product[]>('products.json');
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
    const { data, error } = await sb
      .from('orders')
      .update(row)
      .eq('id', id)
      .select('*, order_items(*), keg_returns(*)')
      .single();
    if (error) return undefined;
    return rowToOrder(data);
  }
  const orders = readJSON<Order[]>('orders.json');
  const index = orders.findIndex(o => o.id === id);
  if (index === -1) return undefined;
  orders[index] = { ...orders[index], ...updates };
  writeJSON('orders.json', orders);
  return orders[index];
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
    });
    if (error) throw error;
    return entry;
  }
  const ledger = readJSON<KegLedgerEntry[]>('keg-ledger.json');
  ledger.push(entry);
  writeJSON('keg-ledger.json', ledger);
  return entry;
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
  const balance: Record<string, number> = { '1/2bbl': 0, '1/4bbl': 0, '1/6bbl': 0 };
  for (const entry of entries) {
    if (entry.type === 'deposit') {
      balance[entry.size] += entry.quantity;
    } else {
      balance[entry.size] -= entry.quantity;
    }
  }
  return balance;
}

export async function getAllKegBalances(): Promise<Record<string, Record<string, number>>> {
  const ledger = await getKegLedger();
  const balances: Record<string, Record<string, number>> = {};
  for (const entry of ledger) {
    if (!balances[entry.customerId]) {
      balances[entry.customerId] = { '1/2bbl': 0, '1/4bbl': 0, '1/6bbl': 0 };
    }
    if (entry.type === 'deposit') {
      balances[entry.customerId][entry.size] += entry.quantity;
    } else {
      balances[entry.customerId][entry.size] -= entry.quantity;
    }
  }
  return balances;
}

// ─── Wholesale Applications ────────────────────────────────────────────────────

export async function getApplications(): Promise<WholesaleApplication[]> {
  if (isSupabaseConfigured()) {
    const sb = createAdminClient();
    const { data, error } = await sb.from('applications').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      businessName: row.business_name as string,
      contactName: row.contact_name as string,
      email: row.email as string,
      phone: row.phone as string,
      address: row.address as string,
      businessType: (row.business_type as string) || '',
      expectedMonthlyVolume: (row.expected_monthly_volume as string) || '',
      createdAt: row.created_at as string,
    }));
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
      address: app.address,
      message: '',
      business_type: app.businessType || '',
      expected_monthly_volume: app.expectedMonthlyVolume || '',
    });
    if (error) throw error;
    return app;
  }
  const apps = readJSON<WholesaleApplication[]>('applications.json');
  apps.push(app);
  writeJSON('applications.json', apps);
  return app;
}
