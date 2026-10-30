import { KEG_DEPOSITS, type Invoice, type KegReturn, type OrderItem } from '@/lib/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Deposit credit for empties the customer handed back. Priced from the
 * canonical KEG_DEPOSITS table — returns are empties from any past order, not
 * necessarily this cart, so matching to a line item would change the credit
 * whenever the returned size isn't among the items. */
export function returnsCreditFor(kegReturns: KegReturn[]): number {
  return round2(
    kegReturns.reduce((s, r) => s + (KEG_DEPOSITS[r.size] ?? 0) * Math.max(0, r.quantity || 0), 0),
  );
}

export interface OrderTotals {
  subtotal: number;
  depositsOut: number;
  returnsCredit: number;
  /** Net deposit: depositsOut - returnsCredit. Can be negative. */
  totalDeposit: number;
  total: number;
}

/** No-charge account (the brewery's own taproom): every line is priced at $0,
 * deposits included, so the order still records what beer went out (volume
 * reports, inventory, kegs) without counting as revenue. */
export function noChargeItems<T extends OrderItem>(items: T[]): T[] {
  return items.map((i) => ({ ...i, unitPrice: 0, deposit: 0 }));
}

/** Single source of truth for an order's money. Checkout, the order POST, the
 * admin edit PUT and the invoice all agree because they all call this.
 * `noCharge` zeroes everything, keg-returns credit too: an internal account
 * pays no deposit, so a credit would only push the invoice below $0. */
export function computeOrderTotals(
  items: OrderItem[],
  kegReturns: KegReturn[],
  opts: { noCharge?: boolean } = {},
): OrderTotals {
  if (opts.noCharge) {
    return { subtotal: 0, depositsOut: 0, returnsCredit: 0, totalDeposit: 0, total: 0 };
  }
  const subtotal = round2(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  const depositsOut = round2(items.reduce((s, i) => s + i.deposit * i.quantity, 0));
  const returnsCredit = returnsCreditFor(kegReturns);
  const totalDeposit = round2(depositsOut - returnsCredit);
  return { subtotal, depositsOut, returnsCredit, totalDeposit, total: round2(subtotal + totalDeposit) };
}

export interface InvoiceBreakdown {
  subtotal: number;
  depositsCharged: number;
  returnsCredit: number;
  total: number;
}

/** Splits an invoice's stored net deposit back into "deposits charged" and
 * "keg returns credit" so the printed invoice shows the credit as its own
 * line. Invoices store only the net (totalDeposit), so the credit is derived:
 * whatever the line-item deposits exceed the net by. That always reconciles
 * with the stored total, even for invoices written before this helper. */
export function invoiceBreakdown(
  inv: Pick<Invoice, 'subtotal' | 'totalDeposit' | 'total'> & { items: { deposit?: number; quantity: number }[] },
): InvoiceBreakdown {
  const depositsCharged = round2(inv.items.reduce((s, i) => s + (i.deposit ?? 0) * i.quantity, 0));
  const returnsCredit = round2(Math.max(0, depositsCharged - inv.totalDeposit));
  return { subtotal: inv.subtotal, depositsCharged, returnsCredit, total: inv.total };
}
