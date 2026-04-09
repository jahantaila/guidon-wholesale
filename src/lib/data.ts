import fs from 'fs';
import path from 'path';
import type { Customer, Product, Order, Invoice, KegLedgerEntry } from './types';

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

// Customers
export function getCustomers(): Customer[] {
  return readJSON<Customer[]>('customers.json');
}

export function getCustomer(id: string): Customer | undefined {
  return getCustomers().find(c => c.id === id);
}

export function createCustomer(customer: Customer): Customer {
  const customers = getCustomers();
  customers.push(customer);
  writeJSON('customers.json', customers);
  return customer;
}

export function updateCustomer(id: string, updates: Partial<Customer>): Customer | undefined {
  const customers = getCustomers();
  const index = customers.findIndex(c => c.id === id);
  if (index === -1) return undefined;
  customers[index] = { ...customers[index], ...updates };
  writeJSON('customers.json', customers);
  return customers[index];
}

export function deleteCustomer(id: string): boolean {
  const customers = getCustomers();
  const filtered = customers.filter(c => c.id !== id);
  if (filtered.length === customers.length) return false;
  writeJSON('customers.json', filtered);
  return true;
}

// Products
export function getProducts(): Product[] {
  return readJSON<Product[]>('products.json');
}

export function getProduct(id: string): Product | undefined {
  return getProducts().find(p => p.id === id);
}

// Orders
export function getOrders(): Order[] {
  return readJSON<Order[]>('orders.json');
}

export function getOrder(id: string): Order | undefined {
  return getOrders().find(o => o.id === id);
}

export function createOrder(order: Order): Order {
  const orders = getOrders();
  orders.push(order);
  writeJSON('orders.json', orders);
  return order;
}

export function updateOrder(id: string, updates: Partial<Order>): Order | undefined {
  const orders = getOrders();
  const index = orders.findIndex(o => o.id === id);
  if (index === -1) return undefined;
  orders[index] = { ...orders[index], ...updates };
  writeJSON('orders.json', orders);
  return orders[index];
}

// Invoices
export function getInvoices(): Invoice[] {
  return readJSON<Invoice[]>('invoices.json');
}

export function getInvoice(id: string): Invoice | undefined {
  return getInvoices().find(i => i.id === id);
}

export function createInvoice(invoice: Invoice): Invoice {
  const invoices = getInvoices();
  invoices.push(invoice);
  writeJSON('invoices.json', invoices);
  return invoice;
}

export function updateInvoice(id: string, updates: Partial<Invoice>): Invoice | undefined {
  const invoices = getInvoices();
  const index = invoices.findIndex(i => i.id === id);
  if (index === -1) return undefined;
  invoices[index] = { ...invoices[index], ...updates };
  writeJSON('invoices.json', invoices);
  return invoices[index];
}

// Keg Ledger
export function getKegLedger(): KegLedgerEntry[] {
  return readJSON<KegLedgerEntry[]>('keg-ledger.json');
}

export function addKegLedgerEntry(entry: KegLedgerEntry): KegLedgerEntry {
  const ledger = getKegLedger();
  ledger.push(entry);
  writeJSON('keg-ledger.json', ledger);
  return entry;
}

export function getKegLedgerByCustomer(customerId: string): KegLedgerEntry[] {
  return getKegLedger().filter(e => e.customerId === customerId);
}

export function getKegBalanceByCustomer(customerId: string): Record<string, number> {
  const entries = getKegLedgerByCustomer(customerId);
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

export function getAllKegBalances(): Record<string, Record<string, number>> {
  const ledger = getKegLedger();
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
