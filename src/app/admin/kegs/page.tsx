'use client';

import { useState, useEffect, Fragment, useCallback, useMemo } from 'react';
import { Customer, KegBalance, KegLedgerEntry, KegSize, KEG_DEPOSITS } from '@/lib/types';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';

type AdjustForm = { customerId: string; type: 'return' | 'deposit'; size: KegSize; quantity: number; notes: string };
const emptyAdjust: AdjustForm = { customerId: '', type: 'return', size: '1/2bbl', quantity: 1, notes: '' };

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

function getAgeColor(days: number): string {
  if (days > 90) return 'text-red-400';
  if (days > 60) return 'text-orange-400';
  if (days > 30) return 'text-gold';
  return 'text-emerald-400';
}

export default function KegTrackerPage() {
  const [balances, setBalances] = useState<CustomerBalance[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allLedger, setAllLedger] = useState<KegLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<KegLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  useBodyScrollLock(adjustOpen);
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(emptyAdjust);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [balancesRes, customersRes, ledgerRes] = await Promise.all([
          adminFetch('/api/keg-ledger?balances=true'),
          adminFetch('/api/customers'),
          adminFetch('/api/keg-ledger'),
        ]);
        const balancesData = await balancesRes.json();
        const customersData = await customersRes.json();
        const ledgerData = await ledgerRes.json();
        // The /api/keg-ledger?balances=true endpoint returns an object keyed
        // by customerId (Record<string, KegBalance>), not an array. We need
        // { customerId, balance } rows for rendering. Without this conversion
        // the tracker silently shows "No keg balances recorded" even when
        // customers have outstanding kegs.
        const balancesArr: CustomerBalance[] = balancesData && typeof balancesData === 'object' && !Array.isArray(balancesData)
          ? Object.entries(balancesData).map(([customerId, balance]) => ({
              customerId,
              balance: balance as KegBalance,
            }))
          : Array.isArray(balancesData) ? balancesData : [];
        setBalances(balancesArr);
        setCustomers(Array.isArray(customersData) ? customersData : []);
        setAllLedger(Array.isArray(ledgerData) ? ledgerData : []);
      } catch (err) { console.error('Failed to load keg data', err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  // Compute "oldest outstanding deposit age" per customer. FIFO: offset
  // deposits against returns starting from the earliest, then the oldest
  // surviving deposit's date is what Mike cares about. If balance is zero
  // or negative, return null (no outstanding kegs).
  const oldestAgeByCustomer = useMemo(() => {
    const map = new Map<string, number>(); // customerId -> days
    const byCustomer = new Map<string, KegLedgerEntry[]>();
    for (const e of allLedger) {
      if (!byCustomer.has(e.customerId)) byCustomer.set(e.customerId, []);
      byCustomer.get(e.customerId)!.push(e);
    }
    const now = Date.now();
    byCustomer.forEach((entries, custId) => {
      // Sort by date ascending.
      const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      // Build a queue of deposit quantities with their date; consume from front
      // with each return.
      type Q = { date: string; qty: number };
      const queue: Q[] = [];
      for (const e of sorted) {
        if (e.type === 'deposit') {
          queue.push({ date: e.date, qty: e.quantity });
        } else {
          let remaining = e.quantity;
          while (remaining > 0 && queue.length > 0) {
            const head = queue[0];
            if (head.qty <= remaining) {
              remaining -= head.qty;
              queue.shift();
            } else {
              head.qty -= remaining;
              remaining = 0;
            }
          }
        }
      }
      if (queue.length > 0) {
        const oldest = queue[0].date;
        const days = Math.floor((now - new Date(oldest).getTime()) / (1000 * 60 * 60 * 24));
        map.set(custId, days);
      }
    });
    return map;
  }, [allLedger]);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const handleExpand = async (customerId: string) => {
    if (expandedId === customerId) { setExpandedId(null); return; }
    setExpandedId(customerId);
    setLedgerLoading(true);
    try {
      const res = await adminFetch(`/api/keg-ledger?customerId=${customerId}`);
      const data = await res.json();
      setLedgerEntries(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load ledger', err); setLedgerEntries([]); }
    finally { setLedgerLoading(false); }
  };

  const handleExport = () => window.open('/api/keg-ledger/export', '_blank');

  const openAdjust = (customerId: string, type: 'return' | 'deposit') => {
    setAdjustForm({ ...emptyAdjust, customerId, type });
    setAdjustError('');
    setAdjustOpen(true);
  };

  const refreshBalances = useCallback(async () => {
    try {
      const [bRes, allRes] = await Promise.all([
        adminFetch('/api/keg-ledger?balances=true'),
        adminFetch('/api/keg-ledger'),
      ]);
      const bData = await bRes.json();
      const allData = await allRes.json();
      setBalances(Array.isArray(bData) ? bData : []);
      setAllLedger(Array.isArray(allData) ? allData : []);
    } catch {}
  }, []);

  const submitAdjust = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustSaving(true);
    setAdjustError('');
    try {
      const res = await adminFetch('/api/keg-ledger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: adjustForm.customerId,
          type: adjustForm.type,
          size: adjustForm.size,
          quantity: adjustForm.quantity,
          notes: adjustForm.notes ? `Admin: ${adjustForm.notes}` : 'Admin adjustment',
        }),
      });
      if (res.ok) {
        setAdjustOpen(false);
        setToast(`${adjustForm.type === 'return' ? 'Return' : 'Deposit'} recorded.`);
        window.setTimeout(() => setToast(''), 3000);
        await refreshBalances();
        if (expandedId === adjustForm.customerId) {
          const lr = await adminFetch(`/api/keg-ledger?customerId=${adjustForm.customerId}`);
          const ld = await lr.json();
          setLedgerEntries(Array.isArray(ld) ? ld : []);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setAdjustError(data?.error || 'Save failed.');
      }
    } catch { setAdjustError('Save failed. Try again.'); }
    finally { setAdjustSaving(false); }
  }, [adjustForm, expandedId, refreshBalances]);

  const totals = balances.reduce((acc, b) => ({
    half: acc.half + (b.balance['1/2bbl'] || 0),
    quarter: acc.quarter + (b.balance['1/4bbl'] || 0),
    sixth: acc.sixth + (b.balance['1/6bbl'] || 0),
  }), { half: 0, quarter: 0, sixth: 0 });
  const grandTotal = totals.half + totals.quarter + totals.sixth;
  const depositValue =
    totals.half * KEG_DEPOSITS['1/2bbl'] +
    totals.quarter * KEG_DEPOSITS['1/4bbl'] +
    totals.sixth * KEG_DEPOSITS['1/6bbl'];

  return (
    <div className="space-y-6">
      {toast && <div className="toast" style={{ color: 'var(--pine)' }}>{toast}</div>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Inventory</span>
          <h2 className="font-heading text-2xl font-black text-cream">Keg Tracker</h2>
        </div>
        <button onClick={handleExport} className="btn-primary self-start">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: '1/2 Barrel', value: totals.half.toString() },
          { label: '1/4 Barrel', value: totals.quarter.toString() },
          { label: '1/6 Barrel', value: totals.sixth.toString() },
          { label: 'Total Kegs', value: grandTotal.toString() },
          { label: 'Deposits Out', value: formatCurrency(depositValue), small: true },
        ].map((item) => (
          <div key={item.label} className="card py-4 px-4 text-center">
            <p className="text-[10px] font-bold text-cream/30 uppercase tracking-widest mb-1">{item.label}</p>
            <p className={cn('font-black text-gold', item.small ? 'text-lg' : 'text-2xl')}>{item.value}</p>
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
                  <th className="table-header text-center">Oldest</th>
                  <th className="table-header text-right">Record</th>
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
                        <td className="table-cell text-center">
                          {(() => {
                            const age = oldestAgeByCustomer.get(entry.customerId);
                            if (total === 0 || age === undefined) return <span className="text-cream/20">—</span>;
                            return (
                              <span
                                className={cn('text-xs font-variant-tabular font-semibold', getAgeColor(age))}
                                title={`Oldest outstanding keg is ${age} days old (FIFO).`}
                              >
                                {age}d
                              </span>
                            );
                          })()}
                        </td>
                        <td className="table-cell text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {total > 0 && (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await adminFetch('/api/admin/remind-kegs', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ customerId: entry.customerId }),
                                      });
                                      if (res.ok) {
                                        setToast('Reminder sent.');
                                        window.setTimeout(() => setToast(''), 3000);
                                      } else {
                                        const data = await res.json().catch(() => ({}));
                                        setToast(data?.error || 'Reminder failed.');
                                        window.setTimeout(() => setToast(''), 4000);
                                      }
                                    } catch {
                                      setToast('Reminder failed.');
                                      window.setTimeout(() => setToast(''), 4000);
                                    }
                                  }}
                                  className="text-xs font-semibold hover:underline"
                                  style={{ color: 'var(--muted)' }}
                                  title="Email the customer reminding them to return kegs"
                                >
                                  Remind
                                </button>
                                <span className="text-cream/20">·</span>
                              </>
                            )}
                            <button onClick={() => openAdjust(entry.customerId, 'return')}
                              className="text-xs font-semibold hover:underline" style={{ color: 'var(--pine)' }}>
                              Return
                            </button>
                            <span className="text-cream/20">·</span>
                            <button onClick={() => openAdjust(entry.customerId, 'deposit')}
                              className="text-xs font-semibold hover:underline" style={{ color: 'var(--brass)' }}>
                              Deposit
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-white/[0.02] px-6 py-4">
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

      {adjustOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-charcoal-100 border border-white/[0.08] rounded-2xl shadow-dark-lg max-w-md w-full p-6 animate-scale-in">
            <h3 className="font-heading text-xl font-bold text-cream mb-1">
              Record {adjustForm.type === 'return' ? 'Keg Return' : 'Keg Deposit'}
            </h3>
            <p className="text-xs text-cream/40 mb-5">
              {customerMap.get(adjustForm.customerId)?.businessName || adjustForm.customerId}
              {adjustForm.type === 'return' ? ' — customer returned kegs in person.' : ' — manual deposit adjustment.'}
            </p>
            <form onSubmit={submitAdjust} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-cream/60 mb-1.5">Size</label>
                  <select value={adjustForm.size} onChange={(e) => setAdjustForm((p) => ({ ...p, size: e.target.value as KegSize }))} className="input">
                    <option value="1/2bbl">1/2 Barrel</option>
                    <option value="1/4bbl">1/4 Barrel</option>
                    <option value="1/6bbl">1/6 Barrel</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cream/60 mb-1.5">Quantity</label>
                  <input type="number" min={1} value={adjustForm.quantity}
                    onChange={(e) => setAdjustForm((p) => ({ ...p, quantity: Math.max(1, Number(e.target.value) || 1) }))}
                    className="input" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-cream/60 mb-1.5">Notes <span className="text-cream/25 font-normal">(optional)</span></label>
                <input type="text" value={adjustForm.notes} onChange={(e) => setAdjustForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="e.g. dropped off at brewery" className="input" />
                <p className="text-[10px] text-cream/25 mt-1">Will appear in the ledger as &ldquo;Admin: {'{your note}'}&rdquo; for the audit trail.</p>
              </div>
              {adjustError && <p className="text-red-400 text-sm">{adjustError}</p>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setAdjustOpen(false)} className="btn-secondary px-4 py-2">Cancel</button>
                <button type="submit" disabled={adjustSaving} className="btn-primary">
                  {adjustSaving ? 'Saving...' : 'Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
