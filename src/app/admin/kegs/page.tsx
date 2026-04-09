'use client';

import { useState, useEffect, Fragment } from 'react';
import { Customer, KegBalance, KegLedgerEntry } from '@/lib/types';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

interface CustomerBalance {
  customerId: string;
  balance: KegBalance;
}

function getCountColor(count: number): string {
  if (count > 20) return 'bg-red-500/20 text-red-400 border border-red-500/30';
  if (count >= 10) return 'bg-gold/20 text-gold border border-gold/30';
  return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
}

function getRowHighlight(total: number): string {
  if (total > 20) return 'border-l-2 border-l-red-500/50';
  if (total >= 10) return 'border-l-2 border-l-gold/50';
  return 'border-l-2 border-l-emerald-500/50';
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
          fetch('/api/keg-ledger?balances=true'), fetch('/api/customers'),
        ]);
        const balancesData = await balancesRes.json();
        const customersData = await customersRes.json();
        setBalances(Array.isArray(balancesData) ? balancesData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
      } catch (err) { console.error('Failed to load keg data', err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const handleExpand = async (customerId: string) => {
    if (expandedId === customerId) { setExpandedId(null); return; }
    setExpandedId(customerId);
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/keg-ledger?customerId=${customerId}`);
      const data = await res.json();
      setLedgerEntries(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load ledger', err); setLedgerEntries([]); }
    finally { setLedgerLoading(false); }
  };

  const handleExport = () => window.open('/api/keg-ledger/export', '_blank');

  const totals = balances.reduce((acc, b) => ({
    half: acc.half + (b.balance['1/2bbl'] || 0),
    quarter: acc.quarter + (b.balance['1/4bbl'] || 0),
    sixth: acc.sixth + (b.balance['1/6bbl'] || 0),
  }), { half: 0, quarter: 0, sixth: 0 });
  const grandTotal = totals.half + totals.quarter + totals.sixth;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-black text-cream">Keg Tracker</h2>
          <p className="text-cream/30 text-sm mt-1">Monitor outstanding keg deposits across all customers</p>
        </div>
        <button onClick={handleExport} className="btn-primary flex items-center gap-2 self-start">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '1/2 Barrel', value: totals.half, color: 'text-gold' },
          { label: '1/4 Barrel', value: totals.quarter, color: 'text-gold' },
          { label: '1/6 Barrel', value: totals.sixth, color: 'text-gold' },
          { label: 'Total Kegs', value: grandTotal, color: 'text-gold' },
        ].map((item) => (
          <div key={item.label} className="card py-4 px-4 text-center">
            <p className="text-[10px] font-bold text-cream/30 uppercase tracking-widest mb-1">{item.label}</p>
            <p className={cn('text-2xl font-black', item.color)}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : balances.length === 0 ? (
          <p className="p-6 text-cream/30 text-sm">No keg balances recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="table-header">Customer</th>
                  <th className="table-header text-center">1/2 Barrel</th>
                  <th className="table-header text-center">1/4 Barrel</th>
                  <th className="table-header text-center">1/6 Barrel</th>
                  <th className="table-header text-center">Total Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {balances.map((entry) => {
                  const total = (entry.balance['1/2bbl'] || 0) + (entry.balance['1/4bbl'] || 0) + (entry.balance['1/6bbl'] || 0);
                  const isExpanded = expandedId === entry.customerId;
                  return (
                    <Fragment key={entry.customerId}>
                      <tr onClick={() => handleExpand(entry.customerId)}
                        className={cn('hover:bg-white/[0.02] transition-colors cursor-pointer', getRowHighlight(total))}>
                        <td className="table-cell font-semibold text-cream">
                          {customerMap.get(entry.customerId)?.businessName || entry.customerId}
                        </td>
                        <td className="table-cell text-center">
                          <span className={cn('badge', getCountColor(entry.balance['1/2bbl'] || 0))}>{entry.balance['1/2bbl'] || 0}</span>
                        </td>
                        <td className="table-cell text-center">
                          <span className={cn('badge', getCountColor(entry.balance['1/4bbl'] || 0))}>{entry.balance['1/4bbl'] || 0}</span>
                        </td>
                        <td className="table-cell text-center">
                          <span className={cn('badge', getCountColor(entry.balance['1/6bbl'] || 0))}>{entry.balance['1/6bbl'] || 0}</span>
                        </td>
                        <td className="table-cell text-center">
                          <span className={cn('badge font-black', getCountColor(total))}>{total}</span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-white/[0.02] px-6 py-4">
                            <div className="animate-fade-in">
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-1 h-4 bg-gold rounded-full" />
                                <h4 className="font-heading font-bold text-cream text-sm">
                                  Ledger &mdash; {customerMap.get(entry.customerId)?.businessName}
                                </h4>
                              </div>
                              {ledgerLoading ? (
                                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}</div>
                              ) : ledgerEntries.length === 0 ? (
                                <p className="text-sm text-cream/30">No ledger entries found.</p>
                              ) : (
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr>
                                      <th className="text-left py-1.5 text-cream/40 font-semibold text-xs">Date</th>
                                      <th className="text-left py-1.5 text-cream/40 font-semibold text-xs">Type</th>
                                      <th className="text-left py-1.5 text-cream/40 font-semibold text-xs">Size</th>
                                      <th className="text-right py-1.5 text-cream/40 font-semibold text-xs">Qty</th>
                                      <th className="text-right py-1.5 text-cream/40 font-semibold text-xs">Amount</th>
                                      <th className="text-left py-1.5 text-cream/40 font-semibold text-xs">Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ledgerEntries.map((le) => (
                                      <tr key={le.id} className="border-t border-white/[0.04]">
                                        <td className="py-1.5 text-cream/60">{formatDate(le.date)}</td>
                                        <td className="py-1.5">
                                          <span className={cn('badge text-[10px]',
                                            le.type === 'deposit' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/20' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20'
                                          )}>{le.type}</span>
                                        </td>
                                        <td className="py-1.5 text-cream/50">{le.size}</td>
                                        <td className="py-1.5 text-right text-cream/60">{le.quantity}</td>
                                        <td className="py-1.5 text-right text-cream/60">{formatCurrency(le.totalAmount)}</td>
                                        <td className="py-1.5 text-cream/30">{le.notes || '\u2014'}</td>
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
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
