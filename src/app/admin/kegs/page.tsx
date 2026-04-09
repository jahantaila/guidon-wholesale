'use client';

import { useState, useEffect, Fragment } from 'react';
import { Customer, KegBalance, KegLedgerEntry } from '@/lib/types';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

interface CustomerBalance {
  customerId: string;
  balance: KegBalance;
}

function getCountColor(count: number): string {
  if (count > 20) return 'bg-red-100 text-red-800';
  if (count >= 10) return 'bg-amber-100 text-amber-800';
  return 'bg-green-100 text-green-800';
}

export default function KegTrackerPage() {
  const [balances, setBalances] = useState<CustomerBalance[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<KegLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [balancesRes, customersRes] = await Promise.all([
          fetch('/api/keg-ledger?balances=true'),
          fetch('/api/customers'),
        ]);
        const balancesData = await balancesRes.json();
        const customersData = await customersRes.json();
        setBalances(Array.isArray(balancesData) ? balancesData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
      } catch (err) {
        console.error('Failed to load keg data', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const handleExpand = async (customerId: string) => {
    if (expandedId === customerId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(customerId);
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/keg-ledger?customerId=${customerId}`);
      const data = await res.json();
      setLedgerEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load ledger', err);
      setLedgerEntries([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleExport = () => {
    window.open('/api/keg-ledger/export', '_blank');
  };

  const totals = balances.reduce(
    (acc, b) => ({
      half: acc.half + (b.balance['1/2bbl'] || 0),
      quarter: acc.quarter + (b.balance['1/4bbl'] || 0),
      sixth: acc.sixth + (b.balance['1/6bbl'] || 0),
    }),
    { half: 0, quarter: 0, sixth: 0 }
  );
  const grandTotal = totals.half + totals.quarter + totals.sixth;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl font-bold text-olive">Keg Tracker</h2>
        <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : balances.length === 0 ? (
          <p className="p-6 text-brown-200 text-sm">No keg balances recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-cream-50">
                <tr>
                  <th className="table-header">Customer</th>
                  <th className="table-header text-center">1/2 Barrel</th>
                  <th className="table-header text-center">1/4 Barrel</th>
                  <th className="table-header text-center">1/6 Barrel</th>
                  <th className="table-header text-center">Total Kegs Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {balances.map((entry) => {
                  const total = (entry.balance['1/2bbl'] || 0) + (entry.balance['1/4bbl'] || 0) + (entry.balance['1/6bbl'] || 0);
                  const isExpanded = expandedId === entry.customerId;
                  return (
                    <Fragment key={entry.customerId}>
                      <tr
                        onClick={() => handleExpand(entry.customerId)}
                        className="hover:bg-cream-50 transition-colors cursor-pointer"
                      >
                        <td className="table-cell font-medium">
                          {customerMap.get(entry.customerId)?.businessName || entry.customerId}
                        </td>
                        <td className="table-cell text-center">
                          <span className={cn('badge', getCountColor(entry.balance['1/2bbl'] || 0))}>
                            {entry.balance['1/2bbl'] || 0}
                          </span>
                        </td>
                        <td className="table-cell text-center">
                          <span className={cn('badge', getCountColor(entry.balance['1/4bbl'] || 0))}>
                            {entry.balance['1/4bbl'] || 0}
                          </span>
                        </td>
                        <td className="table-cell text-center">
                          <span className={cn('badge', getCountColor(entry.balance['1/6bbl'] || 0))}>
                            {entry.balance['1/6bbl'] || 0}
                          </span>
                        </td>
                        <td className="table-cell text-center">
                          <span className={cn('badge font-bold', getCountColor(total))}>
                            {total}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-cream-50 px-6 py-4">
                            <div className="animate-fade-in">
                              <h4 className="font-semibold text-olive mb-3">
                                Keg Ledger History &mdash; {customerMap.get(entry.customerId)?.businessName}
                              </h4>
                              {ledgerLoading ? (
                                <div className="space-y-2">
                                  {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="skeleton h-8 w-full" />
                                  ))}
                                </div>
                              ) : ledgerEntries.length === 0 ? (
                                <p className="text-sm text-brown-200">No ledger entries found.</p>
                              ) : (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr>
                                      <th className="text-left py-1 text-olive">Date</th>
                                      <th className="text-left py-1 text-olive">Type</th>
                                      <th className="text-left py-1 text-olive">Size</th>
                                      <th className="text-right py-1 text-olive">Qty</th>
                                      <th className="text-right py-1 text-olive">Amount</th>
                                      <th className="text-left py-1 text-olive">Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ledgerEntries.map((le) => (
                                      <tr key={le.id} className="border-t border-cream-200">
                                        <td className="py-1">{formatDate(le.date)}</td>
                                        <td className="py-1">
                                          <span className={cn(
                                            'badge',
                                            le.type === 'deposit' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                          )}>
                                            {le.type}
                                          </span>
                                        </td>
                                        <td className="py-1">{le.size}</td>
                                        <td className="py-1 text-right">{le.quantity}</td>
                                        <td className="py-1 text-right">{formatCurrency(le.totalAmount)}</td>
                                        <td className="py-1 text-brown-200">{le.notes || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {/* Summary row */}
                <tr className="bg-olive-50 font-bold">
                  <td className="table-cell">Totals</td>
                  <td className="table-cell text-center">{totals.half}</td>
                  <td className="table-cell text-center">{totals.quarter}</td>
                  <td className="table-cell text-center">{totals.sixth}</td>
                  <td className="table-cell text-center">{grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
