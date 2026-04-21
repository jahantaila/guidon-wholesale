export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function generateId(prefix: string): string {
  const num = Math.floor(Math.random() * 900000) + 100000;
  return `${prefix}-${num}`;
}

// Returns the class name for a status badge. Legible variants live in
// globals.css under `.badge-status-*` — they use design tokens so colors
// stay readable on the cream paper theme. Unknown statuses fall through
// to a quiet default pill.
const KNOWN_STATUSES = new Set([
  'pending', 'confirmed', 'completed', 'cancelled',
  'draft', 'paid', 'unpaid', 'overdue',
  'approved', 'rejected',
]);

export function getStatusColor(status: string): string {
  return KNOWN_STATUSES.has(status)
    ? `badge-status-${status}`
    : 'badge-status-default';
}
