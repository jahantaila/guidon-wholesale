export interface Customer {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  password?: string;
  /** Brewery-only notes. Not visible to the customer. */
  notes?: string;
  /** Free-form tags like "priority", "net-30", "tasting-room". */
  tags?: string[];
  /** When true, invoice auto-sends on order-delivered transition. */
  autoSendInvoices?: boolean;
  /** Soft-delete timestamp; archived customers are hidden from default lists. */
  archivedAt?: string | null;
  createdAt: string;
}

export interface WholesaleApplication {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  businessType: string;
  expectedMonthlyVolume: string;
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

export type KegSize = '1/2bbl' | '1/4bbl' | '1/6bbl';

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'completed';

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
}

export interface CartItem {
  productId: string;
  productName: string;
  size: KegSize;
  quantity: number;
  unitPrice: number;
  deposit: number;
}

export interface KegBalance {
  '1/2bbl': number;
  '1/4bbl': number;
  '1/6bbl': number;
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

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
