export interface Customer {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  password?: string;
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
}

export interface Product {
  id: string;
  name: string;
  style: string;
  abv: number;
  description: string;
  sizes: ProductSize[];
  category: string;
  available: boolean;
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

export type InvoiceStatus = 'unpaid' | 'paid' | 'overdue';

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
