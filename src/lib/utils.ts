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

export function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-gold/20 text-gold border border-gold/30';
    case 'confirmed':
      return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    case 'delivered':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    case 'completed':
      return 'bg-olive/30 text-olive-300 border border-olive/40';
    case 'paid':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    case 'unpaid':
      return 'bg-red-500/20 text-red-300 border border-red-500/30';
    case 'overdue':
      return 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
    default:
      return 'bg-white/10 text-cream/60 border border-white/10';
  }
}
