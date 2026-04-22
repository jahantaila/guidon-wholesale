import type { BrewSchedule, Product } from './types';

/** Escape text for HTML insertion — keep this in-module so we don't pull in
 * a DOMPurify dep for a print-only document. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sizeLabel(size: string): string {
  const map: Record<string, string> = {
    '1/2bbl': '1/2 Barrel',
    '1/4bbl': '1/4 Barrel',
    '1/6bbl': '1/6 Barrel',
  };
  return map[size] || size;
}

function prettyDate(iso: string): string {
  // ISO date string like 2026-05-03 — parse as local to avoid timezone shift
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Produce a self-contained HTML document for the brewing schedule. Opens
 * in a popup and auto-triggers window.print() so the user can Save as PDF
 * via the browser's native dialog. No external deps, no server round-trip.
 *
 * Styled with the DESIGN.md tokens: cream paper, brass accents, Source
 * Serif fallback. Fonts use system serif as a fallback since the popup
 * inherits nothing from the app shell.
 */
export function renderBrewSchedulePrintHtml(args: {
  brews: BrewSchedule[];
  products: Product[];
  filterLabel: string;
  generatedAt?: Date;
}): string {
  const { brews, products, filterLabel } = args;
  const generatedAt = args.generatedAt ?? new Date();
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Sort by brew date ascending — a scheduling doc reads naturally in time
  // order, not by ranking or deficit.
  const sorted = [...brews].sort((a, b) => a.brewDate.localeCompare(b.brewDate));

  const totalYield = sorted.reduce((sum, b) => sum + (b.expectedYield || 0), 0);
  const pendingCount = sorted.filter((b) => !b.completedAt).length;
  const completedCount = sorted.length - pendingCount;

  const rows = sorted
    .map((b) => {
      const product = productMap.get(b.productId);
      const name = product?.name || b.productId;
      const done = Boolean(b.completedAt);
      const status = done ? 'Complete' : 'Scheduled';
      const statusColor = done ? '#3C6E47' : '#9E7A3B';
      return `
        <tr>
          <td>${escapeHtml(prettyDate(b.brewDate))}</td>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(sizeLabel(b.size))}</td>
          <td class="num">${b.expectedYield || 0}</td>
          <td style="color:${statusColor};font-weight:600;">${status}</td>
          <td class="notes">${escapeHtml(b.notes || '')}</td>
        </tr>
      `;
    })
    .join('');

  const emptyState = sorted.length === 0
    ? '<tr><td colspan="6" class="empty">No brews match the selected filter.</td></tr>'
    : '';

  const generatedLabel = generatedAt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Guidon Brewing Co. — Brewing Schedule</title>
  <style>
    @page { size: letter portrait; margin: 0.6in 0.5in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 28px;
      font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif;
      color: #2A2416;
      background: #F5EFDF;
      line-height: 1.5;
    }
    .letterhead {
      border-bottom: 2px solid #9E7A3B;
      padding-bottom: 14px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .brand {
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #9E7A3B;
      font-weight: 700;
    }
    h1 {
      margin: 4px 0 0;
      font-family: 'Fraunces', Georgia, serif;
      font-size: 30px;
      font-weight: 500;
      letter-spacing: -0.01em;
      color: #2A2416;
    }
    .meta {
      text-align: right;
      font-size: 11px;
      color: #6B5F48;
    }
    .meta strong {
      color: #2A2416;
      font-weight: 600;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .summary-cell {
      border: 1px solid #D8CDA8;
      background: #FBF7EA;
      padding: 10px 12px;
    }
    .summary-label {
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6B5F48;
      font-weight: 700;
    }
    .summary-value {
      font-family: 'Fraunces', Georgia, serif;
      font-size: 22px;
      color: #2A2416;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    thead tr {
      background: #EEE5CE;
    }
    th {
      text-align: left;
      padding: 7px 8px;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #6B5F48;
      font-weight: 700;
      border-bottom: 1px solid #9E7A3B;
    }
    td {
      padding: 8px;
      border-bottom: 1px solid #E8DFC3;
      vertical-align: top;
    }
    td.num {
      font-family: 'Geist Mono', 'SF Mono', Consolas, monospace;
      text-align: right;
    }
    td.notes {
      color: #6B5F48;
      font-style: italic;
      font-size: 11px;
    }
    td.empty {
      text-align: center;
      padding: 24px;
      color: #6B5F48;
      font-style: italic;
    }
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #D8CDA8;
      font-size: 10px;
      color: #6B5F48;
      text-align: center;
    }
    @media print {
      body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="letterhead">
    <div>
      <div class="brand">Guidon Brewing Co.</div>
      <h1>Brewing Schedule</h1>
    </div>
    <div class="meta">
      <div><strong>${escapeHtml(filterLabel)}</strong></div>
      <div>Generated ${escapeHtml(generatedLabel)}</div>
    </div>
  </div>

  <div class="summary">
    <div class="summary-cell">
      <div class="summary-label">Brews</div>
      <div class="summary-value">${sorted.length}</div>
    </div>
    <div class="summary-cell">
      <div class="summary-label">Scheduled</div>
      <div class="summary-value">${pendingCount}</div>
    </div>
    <div class="summary-cell">
      <div class="summary-label">Projected Yield</div>
      <div class="summary-value">${totalYield}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Brew Date</th>
        <th>Beer</th>
        <th>Size</th>
        <th style="text-align:right;">Yield</th>
        <th>Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows}${emptyState}
    </tbody>
  </table>

  <div class="footer">
    ${completedCount > 0 ? `${completedCount} brew${completedCount === 1 ? '' : 's'} already marked complete. ` : ''}Yield numbers are projections; actual landed inventory may differ. &middot; Guidon Brewing Co. &middot; 415 8th Ave. E., Hendersonville, NC 28792
  </div>

  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 50);
    });
  </script>
</body>
</html>`;
}
