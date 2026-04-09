import { NextResponse } from 'next/server';
import { getOrders, getCustomers, getAllKegBalances } from '@/lib/data';
import type { AdminStats } from '@/lib/types';

export async function GET() {
  const orders = getOrders();
  const customers = getCustomers();
  const balances = getAllKegBalances();

  let kegsOut = 0;
  for (const custBalances of Object.values(balances)) {
    for (const count of Object.values(custBalances)) {
      kegsOut += Math.max(0, count);
    }
  }

  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;

  const totalRevenue = orders
    .filter(o => o.status === 'delivered' || o.status === 'completed')
    .reduce((sum, o) => sum + o.total, 0);

  const stats: AdminStats = {
    kegsOut,
    pendingOrders,
    totalRevenue,
    totalCustomers: customers.length,
  };

  return NextResponse.json(stats);
}
