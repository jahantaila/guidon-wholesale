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
   * confirmed; can be adjusted manually by admin. 0 means out of stock but
   * checkout doesn't hard-block (brewery can brew-to-order). */
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
  deliveryDate: string;
  notes: string;
  createdAt: string;
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

/** 'pending' returns are customer-initiated requests awaiting admin pickup
 * approval — they show in the tracker but DO NOT decrement the balance.
 * 'approved' is the default and the only status that affects the balance.
 * 'rejected' returns are kept for audit trail but also don't affect balance. */
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

export const KEG_DEPOSITS: Record<KegSize, number> = {
  '1/2bbl': 50,
  '1/4bbl': 40,
  '1/6bbl': 30,
};
