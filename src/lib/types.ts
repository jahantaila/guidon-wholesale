export interface Customer {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  /** ABC liquor permit / license number. Copied from the wholesale
   * application at approval time. Surfaced on the customer's portal
   * Account tab (read-only) and on invoices. Empty string for legacy
   * customers approved before this column existed — display as 'N/A'. */
  abcPermitNumber: string;
  /** Brewery-internal identifier (state license number, ABC account
   * ID, internal code, etc.). Admin-only — never sent to the customer's
   * portal session, never displayed on customer-facing pages or
   * invoices. Editable only from the admin Customer Edit modal. */
  customerIdentification?: string;
  /** How the customer plans to pay. Defaults to 'no_preference' for
   * legacy rows so the type stays narrow without optional. */
  preferredPaymentMethod: PreferredPaymentMethod;
  password?: string;
  /** Brewery-only notes. Not visible to the customer. */
  notes?: string;
  /** Free-form tags like "priority", "net-30", "tasting-room". */
  tags?: string[];
  /** When true, invoice auto-sends when order is confirmed. */
  autoSendInvoices?: boolean;
  /** Soft-delete timestamp; archived customers are hidden from default lists. */
  archivedAt?: string | null;
  /** Set to true when admin approves an application and a temp password is
   * generated. Portal shows a forced change-password prompt on login until
   * the customer sets their own password (which clears this flag). */
  mustChangePassword?: boolean;
  /** CRM: next scheduled visit / follow-up date (YYYY-MM-DD). Admin-only —
   * never sent to the customer portal. null/undefined = none scheduled. */
  nextFollowupDate?: string | null;
  /** CRM: free-form comments for the scheduled follow-up. Admin-only. */
  nextFollowupNotes?: string;
  createdAt: string;
}

/** How the applicant plans to pay — surfaced on the application so Mike
 * can factor it into the approval call without a follow-up call. 'check' =
 * paper check; 'fintech' = any digital rail (ACH, Zelle, card, etc.);
 * 'no_preference' = applicant didn't pick. */
export type PreferredPaymentMethod = 'check' | 'fintech' | 'no_preference';

export interface WholesaleApplication {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  /** ABC liquor license / permit number. Required at submission so the
   * brewery has the legal license on file before approving. */
  abcPermitNumber: string;
  businessType: string;
  expectedMonthlyVolume: string;
  preferredPaymentMethod?: PreferredPaymentMethod;
  status?: ApplicationStatus;
  createdAt: string;
}

export interface ProductSize {
  size: KegSize;
  price: number;
  deposit: number;
  /** On-hand keg count for this product+size. Decrements when an order is
   * confirmed; can be adjusted manually by admin.
   *
   * Since 2026-08-07, order PLACEMENT rejects more than `inventoryCount` with
   * a 409. Previously there was no check anywhere, so a size with 1 on hand
   * accepted an order for 2 (reported after a Kolsch was oversold). To take a
   * backorder, raise the count first.
   *
   * This is NOT a full reservation. Stock is still only decremented at admin
   * confirmation, and `adjustProductInventory` clamps at 0, so two customers
   * ordering the last keg simultaneously both pass placement and both get
   * confirmed. Closing that needs a re-check inside the pending->confirmed
   * transition. The cron path (/api/cron/recurring-orders) calls createOrder
   * directly and skips this gate entirely. */
  inventoryCount: number;
  /** Par level: when inventory drops below this threshold, brewing alert
   * fires on the dashboard. null/undefined = use global default (5). */
  parLevel?: number | null;
  /** Admin-defined display order. Lower numbers render first. */
  sortOrder?: number | null;
  /** Whether this size is currently offered for this beer. If false, the
   * customer card shows the size button disabled with a hover tooltip; the
   * size still persists in the DB so admin can re-enable without losing
   * pricing/inventory data. */
  available?: boolean;
}

export interface Product {
  id: string;
  name: string;
  style: string;
  abv: number;
  ibu?: number;
  description: string;
  sizes: ProductSize[];
  category: string;
  available: boolean;
  /** Admin-defined display order for the whole product. Lower renders first,
   * on both the admin catalog and the customer-facing order page. null/undefined
   * sorts last (new products land at the bottom until dragged into place). */
  sortOrder?: number | null;
  /** Path under /public/images/products or external URL. Empty = use
   * typographic card treatment (no raster image). */
  imageUrl?: string;
  /** Award strings like "2025 NC Brewers Cup Gold Medal". Rendered as a
   * small accolade row on the product card. */
  awards?: string[];
  /** "NEW RELEASE" badge on the card. */
  newRelease?: boolean;
  /** "LIMITED" badge — typically means only one size available. */
  limitedRelease?: boolean;
}

// KegSize was a fixed union ('1/2bbl' | '1/4bbl' | '1/6bbl'). Admin now
// defines arbitrary sizes ("Mixed Case", "1 Barrel", "12-pack", etc.) on
// each product. The type stays string so existing code compiles; deposit
// / price per size live on the product_sizes row, so there's no global
// lookup table anymore.
export type KegSize = string;
/** Legacy defaults kept for backward compat + keg-return fallbacks. */
export const LEGACY_KEG_SIZES = ['1/2bbl', '1/4bbl', '1/6bbl'] as const;

// Order lifecycle: pending (customer placed) → confirmed (brewery committed,
// inventory reserved, kegs posted to ledger, invoice ready) → completed
// (closed out, paid + kegs returned or written off). cancelled is the
// out-of-band path; admin voids before the order ships.
export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface OrderItem {
  productId: string;
  productName: string;
  size: KegSize;
  quantity: number;
  unitPrice: number;
  deposit: number;
}

export interface KegReturn {
  size: KegSize;
  quantity: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  items: OrderItem[];
  kegReturns: KegReturn[];
  subtotal: number;
  totalDeposit: number;
  total: number;
  /** @deprecated Customer-side delivery date selection was removed in
   * 2026-04-29 per client request. The brewery delivers Thursdays and
   * Fridays — admin schedules internally. Field kept on the type and
   * column kept in the DB for legacy data, but new orders write `null`. */
  deliveryDate?: string | null;
  notes: string;
  /** When the order was actually entered. Immutable — never back-dated. */
  createdAt: string;
  /** Brewery-local calendar date (YYYY-MM-DD) the order counts toward in
   * reports. Set by the admin when an order is entered after month-end but
   * belongs to the previous month. null/undefined = the day it was placed.
   * Every change is recorded in order_reporting_date_changes. */
  reportingDate?: string | null;
}

/** Audit row: one change to an order's reporting date. */
export interface OrderReportingDateChange {
  id: string;
  orderId: string;
  /** null = it was following the placed date. */
  previousDate: string | null;
  /** null = reset to the placed date. */
  newDate: string | null;
  changedAt: string;
}

export interface OrderTemplate {
  id: string;
  customerId: string;
  name: string;
  items: OrderItem[];
  createdAt: string;
}

export interface RecurringOrder {
  id: string;
  customerId: string;
  name: string;
  items: OrderItem[];
  /** How often (in days) the cron creates a new order from this template. */
  intervalDays: number;
  /** When the cron should next create an order (ISO). */
  nextRunAt: string;
  active: boolean;
  /** Set when the 24h heads-up email was fired. Cleared on order creation. */
  headsUpSentAt?: string | null;
  createdAt: string;
}

export type InvoiceStatus = 'draft' | 'unpaid' | 'paid' | 'overdue';

export interface Invoice {
  id: string;
  orderId: string;
  customerId: string;
  status: InvoiceStatus;
  items: OrderItem[];
  subtotal: number;
  totalDeposit: number;
  total: number;
  issuedAt: string;
  /** Set when admin transitions draft -> unpaid (clicks Send Invoice). */
  sentAt?: string | null;
  paidAt: string | null;
}

export type KegLedgerType = 'deposit' | 'return';

/** 'approved' is the default and the only status that affects the balance.
 * 'pending' / 'rejected' are LEGACY: the customer-initiated return approval
 * workflow was retired in 2026-05, so no new non-approved rows are created.
 * The values are kept so any legacy rows still don't count toward the balance
 * (see countsTowardBalance / computeKegBalance). */
export type KegLedgerStatus = 'pending' | 'approved' | 'rejected';

export interface KegLedgerEntry {
  id: string;
  customerId: string;
  orderId: string;
  type: KegLedgerType;
  size: KegSize;
  quantity: number;
  depositAmount: number;
  totalAmount: number;
  date: string;
  notes: string;
  /** Optional for back-compat with existing rows; undefined is treated as
   * 'approved' so legacy data keeps working. */
  status?: KegLedgerStatus;
}

export interface CartItem {
  productId: string;
  productName: string;
  size: KegSize;
  quantity: number;
  unitPrice: number;
  deposit: number;
}

/** KegBalance maps size name to outstanding-kegs count. Sizes are now
 * admin-defined (custom), so the keys are arbitrary strings. The three
 * legacy sizes are still pre-initialized to 0 by the balance computation
 * for backward compat. */
export type KegBalance = Record<string, number>;

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

/** A scheduled brew — admin tells the system "I'm brewing this product/size
 * on this date, expected yield N kegs." The production page uses the
 * earliest uncompleted brewDate per product+size as the "back in stock by"
 * projection so customers and sales know when a deficit clears. */
export interface BrewSchedule {
  id: string;
  productId: string;
  size: KegSize;
  brewDate: string; // YYYY-MM-DD
  expectedYield: number;
  /** Set when the brew actually lands; null = still scheduled. Marking
   * complete also bumps inventory by expectedYield. */
  completedAt?: string | null;
  notes?: string;
  createdAt: string;
}

export interface AdminStats {
  kegsOut: number;
  pendingOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  pendingApplications: number;
}

/** A single brewery-authored announcement shown as a popup on the wholesale
 * portal. Only one alert is active at a time — keeps the UX simple and avoids
 * popup pile-ons. Admin authors it via /admin/alerts. The portal dismisses
 * via localStorage keyed on `id`, so when admin clicks "Reset dismissals" the
 * id changes and everyone sees the alert again. */
export interface WholesaleAlert {
  id: string;
  title: string;
  body: string;
  /** Master kill switch. When false, the portal hides the popup even if the
   * end date hasn't been reached yet — useful for pausing without deleting. */
  active: boolean;
  /** ISO date string. When set and in the past, the popup is suppressed even
   * if active=true. null means "no expiry — show until admin disables." */
  endsAt: string | null;
  updatedAt: string;
}

export const KEG_DEPOSITS: Record<KegSize, number> = {
  '1/2bbl': 50,
  '1/4bbl': 40,
  '1/6bbl': 30,
};

// ─── CRM ──────────────────────────────────────────────────────────────────────

/** Where a non-customer sits in the pipeline. "Customer" is not a value here:
 *  a converted lead becomes a row in `customers`, which is a different table. */
export type CrmStatus = 'lead' | 'prospect';

/** What the CRM list shows per row, once contacts and customers are unioned. */
export type CrmListStatus = CrmStatus | 'customer';

export type CrmActivityType =
  | 'sent_email'
  | 'sent_text'
  | 'spoke_phone'
  | 'left_voicemail'
  | 'cold_call'
  | 'dropped_samples';

/** Mike's own words, in his own order. Used for the one-click log buttons. */
export const CRM_ACTIVITY_LABELS: Record<CrmActivityType, string> = {
  sent_email: 'Sent email',
  sent_text: 'Sent text',
  spoke_phone: 'Spoke on phone',
  left_voicemail: 'Left voice mail',
  cold_call: 'Cold call',
  dropped_samples: 'Dropped off samples',
};

export const CRM_ACTIVITY_TYPES = Object.keys(CRM_ACTIVITY_LABELS) as CrmActivityType[];

/** A lead or prospect: a business the brewery does not sell to yet. */
export interface CrmContact {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  status: CrmStatus;
  notes: string;
  tags: string[];
  nextFollowupDate?: string | null;
  nextFollowupNotes: string;
  /** Set once promoted. The contact then drops out of the default CRM list —
   *  its customer row represents it — but the history is kept. */
  convertedCustomerId?: string | null;
  convertedAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
}

/** One logged touch. Exactly one of customerId / contactId is set. */
export interface CrmActivity {
  id: string;
  customerId?: string | null;
  contactId?: string | null;
  type: CrmActivityType;
  occurredAt: string;
  notes: string;
  /** 'system' when the app logged it itself (e.g. an email it sent). */
  source: 'admin' | 'system';
  createdAt: string;
}

/** A unified CRM list row: leads, prospects and customers in one table. */
export interface CrmListRow {
  id: string;
  status: CrmListStatus;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  /** Address, carried so the CRM search can match on city / street / zip and
   *  so an inline edit has something to prefill. */
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  /** Latest of (last order placed, last logged activity). Null if neither. */
  recentActivityAt: string | null;
  /** What produced recentActivityAt, for the "23d ago · Cold call" label. */
  recentActivitySource: string | null;
  nextFollowupDate?: string | null;
  nextFollowupNotes: string;
  /** Customers only. Lets the list surface who has gone quiet. */
  orderCount: number;
  lastOrderAt: string | null;
}
