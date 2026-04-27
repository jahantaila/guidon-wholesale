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

// US state postal codes for the address dropdown on the apply form and the
// customer create/edit modals. Includes DC + 50 states. Kept as label/value
// pairs so we can render the full name in the dropdown but persist the 2-letter
// code in the DB.
export const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const US_STATE_CODES = new Set(US_STATES.map((s) => s.code));
export function isValidUsStateCode(code: string): boolean {
  return US_STATE_CODES.has(code.toUpperCase());
}

// Source-of-truth on what the address looks like as a single line. Used
// anywhere a one-line label is needed (invoices, route sheets, customer
// detail header). Skips empty parts so legacy rows that only have street
// don't render dangling commas.
export interface AddressParts {
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
}
export function formatAddress(parts: AddressParts): string {
  const street = (parts.streetAddress || '').trim();
  const city = (parts.city || '').trim();
  const state = (parts.state || '').trim();
  const zip = (parts.zip || '').trim();
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return [street, cityStateZip].filter(Boolean).join(', ');
}
