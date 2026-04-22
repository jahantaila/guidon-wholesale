import Link from 'next/link';

// Help content for both the admin panel and customer portal. Kept as JSX
// (not Markdown) so we can link to specific admin pages directly and keep
// formatting without a Markdown dependency. Each "article" renders as a
// single section in the Help page; articles are grouped into top-level
// "topics" for the left-hand TOC.

export interface HelpArticle {
  id: string;
  title: string;
  body: React.ReactNode;
}

export interface HelpTopic {
  id: string;
  title: string;
  articles: HelpArticle[];
}

// ── Shared rendering helpers ────────────────────────────────────────────────

function H({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display mt-6 mb-2" style={{ fontSize: '1.25rem', color: 'var(--ink)', fontWeight: 500 }}>
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="my-2 leading-relaxed" style={{ color: 'var(--ink)' }}>{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 space-y-1 my-2" style={{ color: 'var(--ink)' }}>{children}</ul>;
}

function OL({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-6 space-y-1 my-2" style={{ color: 'var(--ink)' }}>{children}</ol>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="my-3 px-4 py-3"
      style={{
        background: 'color-mix(in srgb, var(--brass) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--brass) 35%, transparent)',
        borderRadius: '3px',
      }}
    >
      <span
        className="section-label block mb-1"
        style={{ color: 'var(--brass)', textTransform: 'uppercase' }}
      >
        Note
      </span>
      <div style={{ color: 'var(--ink)' }}>{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: 'Geist Mono, monospace',
        background: 'color-mix(in srgb, var(--ink) 6%, transparent)',
        padding: '1px 6px',
        borderRadius: '2px',
        fontSize: '0.9em',
      }}
    >
      {children}
    </code>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ color: 'var(--brass)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
      {children}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN HELP CONTENT
// ═══════════════════════════════════════════════════════════════════════════

export const ADMIN_HELP: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    articles: [
      {
        id: 'overview',
        title: 'Welcome to the admin panel',
        body: (
          <>
            <P>
              This is the Guidon Brewing Co. wholesale admin panel. From here you manage
              the product catalog, confirm and fulfill orders, track keg deposits, invoice
              customers, and review wholesale applications. The left sidebar navigates
              between the main sections.
            </P>
            <P>
              The app uses a <strong>paper-and-brass letterpress aesthetic</strong> — it&rsquo;s
              intentionally quiet visually so the data stands out. Tables and cards
              reflow to phone-size viewports if you&rsquo;re running the panel from the taproom.
            </P>
            <H>Typical daily flow</H>
            <OL>
              <li>Open the Dashboard — scan Brewing Alert + Recent Activity.</li>
              <li>Review pending orders on the <AdminLink href="/admin/orders">Orders</AdminLink> page and confirm them.</li>
              <li>Print the <AdminLink href="/admin/deliveries">Delivery Route</AdminLink> sheet for the day&rsquo;s runs.</li>
              <li>Send any invoices that are ready (<AdminLink href="/admin/invoices">Invoices</AdminLink>).</li>
              <li>Check the <AdminLink href="/admin/applications">Applications</AdminLink> inbox for new wholesale signups.</li>
            </OL>
          </>
        ),
      },
      {
        id: 'login-iframe',
        title: 'Logging in (including the embed view)',
        body: (
          <>
            <P>
              The admin panel lives at <Code>/admin</Code>. Sign in with the shared brewery
              password. Sessions persist for 7 days via a cookie + a localStorage token
              (the token is what makes the panel work when embedded as an iframe on other
              websites, where third-party cookies are often blocked).
            </P>
            <P>
              If you get signed out unexpectedly, just sign in again — no data is lost.
            </P>
            <Note>
              If you rotate the admin password in Vercel&rsquo;s environment variables, every
              active session will be invalidated at next probe. Share the new password with
              your team.
            </Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'products',
    title: 'Products & Inventory',
    articles: [
      {
        id: 'adding-a-product',
        title: 'Adding a product',
        body: (
          <>
            <P>
              <AdminLink href="/admin/products">Products</AdminLink> → <strong>Add Product</strong>.
              Fill in the core info (Beer name, Style, ABV, IBU optional, Category, Description).
              The description appears on the customer&rsquo;s Browse &amp; Order cards.
            </P>
            <H>Awards and badges</H>
            <UL>
              <li><strong>Tags &amp; Awards</strong> — one per line, e.g. &ldquo;2025 NC Brewers Cup Gold.&rdquo; Shown as a small accolade row on the customer card.</li>
              <li><strong>New Release</strong> — adds a <Code>NEW</Code> badge.</li>
              <li><strong>Limited Release</strong> — adds a <Code>LIMITED</Code> badge; typically pairs with a single size only.</li>
            </UL>
            <H>Image</H>
            <P>
              <strong>Image URL</strong> is optional. Point to a file in <Code>/public/images/products/</Code> or any
              hosted image. Leave blank and the card renders in a letterpress-only (typographic)
              treatment — matches the paper aesthetic and is a good default.
            </P>
          </>
        ),
      },
      {
        id: 'sizes',
        title: 'Sizes: legacy kegs + custom packs (cases, cans, mixed)',
        body: (
          <>
            <P>
              Every product can have any number of sizes. The three legacy keg sizes
              (<Code>1/2bbl</Code>, <Code>1/4bbl</Code>, <Code>1/6bbl</Code>) have quick-add chips on the
              size table. For anything else — cases of cans, mixed packs, 1-bbl specials —
              click <strong>+ Custom size</strong> and name it anything.
            </P>
            <H>Per-size fields</H>
            <UL>
              <li><strong>Price</strong> — what the customer is charged for one unit.</li>
              <li><strong>Deposit</strong> — keg deposit; $0 for non-returnable packs (cans, cases).</li>
              <li><strong>Inventory</strong> — on-hand count. Decrements automatically when an order is confirmed; restored when an order is cancelled.</li>
              <li><strong>Par</strong> — optional. When inventory drops below par, the Dashboard brewing alert fires. Leave blank to use the default (5).</li>
              <li><strong>Offered</strong> — uncheck to hide a size from customer checkout without losing its price/inventory data. Size row still shows on the customer card but greyed out.</li>
            </UL>
            <H>Reordering sizes (drag + drop)</H>
            <P>
              Grab a size row by the handle and drag it up or down. The order you set here
              is the order the customer sees on the product card. Useful for putting the
              most popular size first (e.g. 1/6bbl for a small-bar-heavy distribution).
            </P>
            <Note>
              <strong>Editing a product preserves all sizes, including custom ones.</strong> If
              you add a &ldquo;Case of Cans&rdquo; size and later edit the product to fix a typo in
              the description, your custom size stays intact on save.
            </Note>
          </>
        ),
      },
      {
        id: 'inventory',
        title: 'Adjusting inventory on the fly',
        body: (
          <>
            <P>
              From <AdminLink href="/admin/products">Products</AdminLink>, use the <Code>+</Code> / <Code>−</Code>
              buttons next to each size&rsquo;s count to bump inventory up or down without opening
              the edit modal. Good for quickly logging a fresh brew or a physical count
              correction.
            </P>
            <P>
              For larger changes (batch deliveries, adjustments across many sizes), use
              <strong> Edit Product</strong> and edit the inventory column directly — it&rsquo;s faster than
              clicking the + button many times.
            </P>
          </>
        ),
      },
      {
        id: 'par-levels',
        title: 'Par levels and the brewing alert',
        body: (
          <>
            <P>
              Par is the <em>minimum on-hand count you want to keep</em>. When a product&rsquo;s
              inventory drops below par, the <AdminLink href="/admin">Dashboard</AdminLink> surfaces a
              <strong> Brewing Alert</strong> row at the top. It also shows up on
              <AdminLink href="/admin/production"> Production</AdminLink> as a deficit line.
            </P>
            <P>
              Par is per size — you can keep lots of 1/2bbls around and just a couple of
              cases of cans on hand, each with their own threshold. Par of 0 means
              &ldquo;never alert&rdquo; (out of stock will still show, but with no alert urgency).
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    articles: [
      {
        id: 'lifecycle',
        title: 'Order lifecycle: pending → confirmed → completed',
        body: (
          <>
            <P>Every order moves through four possible states:</P>
            <UL>
              <li><strong>Pending</strong> — customer placed the order. Nothing has happened yet on the brewery side. Inventory is NOT reserved, no invoice exists yet (except an auto-draft).</li>
              <li><strong>Confirmed</strong> — the brewery has committed to the order. This is the moment when a lot of side-effects fire (see below). Most orders spend most of their life in this state.</li>
              <li><strong>Completed</strong> — the order is fully closed out. Payment received, kegs accounted for. Mostly a bookkeeping state.</li>
              <li><strong>Cancelled</strong> — customer cancelled (before confirm) or brewery voided (anytime). Inventory is restored if it had been reserved; any draft invoice stays for admin cleanup.</li>
            </UL>
            <H>What happens when you click &ldquo;Confirm order →&rdquo;</H>
            <OL>
              <li>Inventory is <strong>decremented</strong> per size on the order.</li>
              <li>A <strong>keg-deposit ledger entry</strong> is posted per size (counts against the customer&rsquo;s outstanding-kegs balance).</li>
              <li>The draft invoice becomes <strong>unpaid + sent</strong> if the customer has <Code>autoSendInvoices</Code> on; otherwise it stays in draft for you to send manually later.</li>
              <li>The customer gets an <strong>&ldquo;Order confirmed&rdquo; email</strong> with the delivery date.</li>
            </OL>
            <H>What happens when you click &ldquo;Mark completed →&rdquo;</H>
            <UL>
              <li>Status changes. No inventory or ledger side-effects (all that happened at confirm).</li>
              <li>No email to the customer (they&rsquo;ve already got the kegs by this point).</li>
            </UL>
            <Note>
              If you confirm an order and then realize you need to change it, use
              <strong> Cancel order</strong> to void it. Inventory restores automatically. Create a new
              order for the customer with the correct items.
            </Note>
          </>
        ),
      },
      {
        id: 'views-and-filters',
        title: 'Cards, Table, Kanban — and the filter panel',
        body: (
          <>
            <P>
              <AdminLink href="/admin/orders">Orders</AdminLink> has three views, toggle top-right:
            </P>
            <UL>
              <li><strong>Cards</strong> (default) — dense grid, one card per order. Best for scanning the book.</li>
              <li><strong>Table</strong> — compact row list with inline actions. Best for bulk ops.</li>
              <li><strong>Kanban</strong> — columns per status. Best for morning stand-up / fulfillment review.</li>
            </UL>
            <H>Filters</H>
            <UL>
              <li><strong>Status tabs</strong> — All / Pending / Confirmed / Completed.</li>
              <li><strong>Delivery chips</strong> — <em>Any / Today / This week / Overdue</em>. Overdue tints ruby when &gt; 0 — catches your eye when you open the page.</li>
              <li><strong>Customer dropdown</strong> — only lists customers with orders on file; keeps the list short.</li>
              <li><strong>Placed-date range</strong> — from/to pickers.</li>
              <li><strong>Search</strong> — matches order ID, business name, contact name, and product name inside the order items.</li>
            </UL>
            <P>
              All filters AND-compose. A <strong>Clear filters</strong> link appears when any filter is
              active, and the result count shows above the list (e.g. &ldquo;Showing 3 of 11&rdquo;).
            </P>
          </>
        ),
      },
      {
        id: 'delivery-date',
        title: 'Rescheduling a delivery',
        body: (
          <>
            <P>
              Expand any pending or confirmed order (click the order row in Table view,
              or <strong>Details ↓</strong> on a card) and edit the date in the
              <strong> Reschedule</strong> field. Change takes effect on blur; the customer is NOT
              emailed (too noisy if you&rsquo;re nudging deliveries around the schedule).
            </P>
            <P>
              If you want the customer notified, drop them a direct email — we intentionally
              don&rsquo;t auto-email on every date change.
            </P>
          </>
        ),
      },
      {
        id: 'keg-reminders',
        title: 'Keg-return reminder email',
        body: (
          <>
            <P>
              Confirmed and completed orders get a <strong>&ldquo;Remind about kegs&rdquo;</strong> button in
              the expanded card. Clicking it emails the customer asking them to put in a
              return request via the portal. Good for accounts that are slow to return empties.
            </P>
            <P>
              You can also send reminders from the
              <AdminLink href="/admin/kegs"> Keg Tracker</AdminLink> page — one click per customer on
              the <strong>Remind</strong> action.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    articles: [
      {
        id: 'adding-customer',
        title: 'Adding a customer manually',
        body: (
          <>
            <P>
              <AdminLink href="/admin/customers">Customers</AdminLink> → <strong>Add Customer</strong>.
              Fill in business name, contact name, email, phone, address, and a login
              password. Share the password with the customer out of band (email it, text,
              whatever). They&rsquo;ll use it to sign into the portal.
            </P>
            <Note>
              If you&rsquo;re approving a wholesale application, <em>skip this step</em>. Approving
              an application auto-creates the customer with a temporary password that gets
              emailed — no manual work.
            </Note>
          </>
        ),
      },
      {
        id: 'csv-import',
        title: 'Importing customers from a CSV file',
        body: (
          <>
            <P>
              <AdminLink href="/admin/customers">Customers</AdminLink> → <strong>Import CSV</strong>. Pick a
              file. The modal validates required columns, shows a 5-row preview, then
              submits each row.
            </P>
            <H>Required columns</H>
            <UL>
              <li><Code>businessName</Code> (or <Code>Business Name</Code>, <Code>company</Code>, <Code>business</Code>)</li>
              <li><Code>contactName</Code> (or <Code>Contact Name</Code>, <Code>name</Code>)</li>
              <li><Code>email</Code></li>
            </UL>
            <H>Optional columns</H>
            <UL>
              <li><Code>phone</Code>, <Code>address</Code>, <Code>notes</Code>, <Code>tags</Code> (comma- or semicolon-separated), <Code>password</Code></li>
            </UL>
            <P>
              Duplicates by email are skipped. Missing required fields skip with a clear
              reason. You&rsquo;ll see an import summary after submit: <strong>N imported / M skipped</strong>
              with per-row reasons for skips.
            </P>
            <Note>
              If you include a <Code>password</Code> column, a Supabase Auth user is provisioned
              right away so the customer can log in immediately. Otherwise they&rsquo;ll need to
              hit &ldquo;Forgot password&rdquo; on first visit.
            </Note>
          </>
        ),
      },
      {
        id: 'customer-views',
        title: 'Table / Cards / Kanban views',
        body: (
          <>
            <P>
              Three view modes, toggle top-right on the customers page:
            </P>
            <UL>
              <li><strong>Table</strong> (default) — compact row per customer with LTV, outstanding AR, last order.</li>
              <li><strong>Cards</strong> — grid of customer cards. Each shows an activity badge (New/Active/At Risk/Lapsed) and outstanding AR if any.</li>
              <li><strong>Kanban</strong> — four columns by ordering recency. Best for a CRM scan: which accounts haven&rsquo;t ordered in a while?</li>
            </UL>
            <H>Activity buckets (Cards + Kanban)</H>
            <UL>
              <li><strong>New</strong> — approved but hasn&rsquo;t placed their first order yet.</li>
              <li><strong>Active</strong> — ordered in the last 30 days.</li>
              <li><strong>At Risk</strong> — last order 30–90 days ago. Candidate for a check-in.</li>
              <li><strong>Lapsed</strong> — no order in 90+ days.</li>
            </UL>
          </>
        ),
      },
      {
        id: 'archive-vs-delete',
        title: 'Delete, Archive, and Restore',
        body: (
          <>
            <P>
              Click <strong>Delete</strong> on a customer row. What happens depends on their history:
            </P>
            <UL>
              <li><strong>No orders / invoices / keg ledger entries</strong> → customer is hard-deleted.</li>
              <li><strong>Has any history</strong> → customer is <em>archived</em> (soft-deleted). Their orders and invoices stay intact for reporting; they&rsquo;re hidden from default dropdowns and listings.</li>
            </UL>
            <P>
              To see archived customers, tick <strong>Show archived</strong> top-left. Each archived
              row has a <strong>Restore</strong> action that brings them back.
            </P>
            <Note>
              Archived customers <strong>cannot log in to the portal</strong>. If they try, they get
              &ldquo;This account has been archived. Please contact the brewery.&rdquo; Restore them
              first if you want them to order again.
            </Note>
          </>
        ),
      },
      {
        id: 'customer-detail-page',
        title: 'Customer detail page',
        body: (
          <>
            <P>
              Click <strong>Details</strong> on a customer row to open their detail page. You&rsquo;ll see:
            </P>
            <UL>
              <li><strong>Snapshot</strong> — orders count, LTV, outstanding AR, kegs outstanding.</li>
              <li><strong>Brewery notes</strong> — free-form admin-only notes about the customer. Not visible on the portal. Good for &ldquo;prefers Thursday deliveries&rdquo;, &ldquo;pays in cash at drop-off&rdquo;, etc.</li>
              <li><strong>Tags</strong> — quick filterable labels (&ldquo;priority&rdquo;, &ldquo;net-30&rdquo;, &ldquo;tasting-room&rdquo;).</li>
              <li><strong>Auto-send invoices</strong> — toggle. When on, the moment an order is confirmed for this customer, the draft invoice flips to unpaid + emails automatically.</li>
              <li><strong>Recurring orders</strong> — schedule a cart to be re-created every N days.</li>
              <li><strong>Order history</strong>, <strong>invoices</strong>, and <strong>keg ledger</strong> for this customer only.</li>
            </UL>
          </>
        ),
      },
    ],
  },
  {
    id: 'applications',
    title: 'Wholesale Applications',
    articles: [
      {
        id: 'approving',
        title: 'Approving an application',
        body: (
          <>
            <P>
              When someone submits the public form at <Code>/apply</Code>, it lands in
              <AdminLink href="/admin/applications"> Applications</AdminLink> under <strong>Pending</strong>.
              Click <strong>Approve</strong>.
            </P>
            <OL>
              <li>The application row flips to <Code>approved</Code>.</li>
              <li>A customer record is auto-created with the applicant&rsquo;s info.</li>
              <li>A random temp password is generated and emailed to them.</li>
              <li>The &ldquo;Create Customer Account&rdquo; modal opens pre-filled so you can adjust any field if needed — or click Skip to leave the auto-created record as-is.</li>
              <li>The customer must change this temp password the first time they log in (forced modal — they can&rsquo;t skip it).</li>
            </OL>
            <Note>
              The sidebar <strong>Applications</strong> badge count drops instantly after approve/reject
              thanks to the <Code>guidon:nav-refresh</Code> event — no 60-second wait.
            </Note>
          </>
        ),
      },
      {
        id: 'rejecting',
        title: 'Rejecting an application',
        body: (
          <>
            <P>
              Click <strong>Reject</strong>, then <strong>Confirm</strong> on the inline prompt. The
              applicant is emailed that their application was not approved at this time (no
              reason is shared by default).
            </P>
            <P>
              Rejected applications stay in the All Applications table with a <Code>REJECTED</Code>
              badge so you have a record.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'invoices',
    title: 'Invoices',
    articles: [
      {
        id: 'invoice-lifecycle',
        title: 'Invoice lifecycle',
        body: (
          <>
            <P>Invoices move through four states:</P>
            <UL>
              <li><strong>Draft</strong> — auto-created when a customer places an order. Internal only; not sent.</li>
              <li><strong>Unpaid</strong> — sent to the customer. Counts toward outstanding AR.</li>
              <li><strong>Paid</strong> — admin marks it paid when money lands.</li>
              <li><strong>Overdue</strong> — unpaid and past due. A cron job flips unpaid → overdue automatically.</li>
            </UL>
          </>
        ),
      },
      {
        id: 'sending',
        title: 'Sending an invoice',
        body: (
          <>
            <P>
              From <AdminLink href="/admin/invoices">Invoices</AdminLink>, click <strong>Send →</strong> on a
              draft row. The customer receives the invoice email; status flips to Unpaid.
            </P>
            <P>
              For customers with <strong>Auto-send invoices</strong> turned on in their detail page,
              this happens automatically when you confirm an order — no manual click needed.
            </P>
            <H>Resending</H>
            <P>
              On an Unpaid invoice, the action is <strong>Re-send →</strong>. Use it if a customer
              says they didn&rsquo;t receive the first email.
            </P>
          </>
        ),
      },
      {
        id: 'marking-paid',
        title: 'Marking an invoice paid',
        body: (
          <>
            <P>
              Open the invoice and click <strong>Mark paid</strong>. The paid-at timestamp is
              recorded. No email is sent — the customer knows they paid.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'production',
    title: 'Production Planning',
    articles: [
      {
        id: 'what-to-brew',
        title: 'Reading the \u201cWhat to Brew\u201d table',
        body: (
          <>
            <P>
              <AdminLink href="/admin/production">Production</AdminLink> → <strong>What to Brew</strong> shows
              every product/size with open orders or on-hand inventory. Columns:
            </P>
            <UL>
              <li><strong>Committed</strong> — total quantity on pending + confirmed orders.</li>
              <li><strong>On Hand</strong> — current inventory.</li>
              <li><strong>Deficit</strong> — how many you need to brew to cover committed orders. Rows with a deficit tint ruby.</li>
              <li><strong>Earliest Delivery</strong> — the soonest delivery date on a committed order for that size.</li>
              <li><strong>Back In Stock By</strong> — the next scheduled brew&rsquo;s date (from the Brewing Schedule section below).</li>
              <li><strong>Action</strong> — at-a-glance status: <Code>Brew →</Code> (need to brew), <Code>Brew Scheduled</Code> (a brew is booked that covers the deficit), <Code>Tight</Code>, <Code>Covered</Code>, or <Code>Surplus</Code>.</li>
            </UL>
          </>
        ),
      },
      {
        id: 'brew-schedule',
        title: 'Scheduling a brew + marking it complete',
        body: (
          <>
            <P>
              Scroll down to the <strong>Brewing Schedule</strong> section and click
              <strong> + Schedule Brew</strong>. Pick:
            </P>
            <UL>
              <li>Beer</li>
              <li>Size</li>
              <li>Brew date (when the kegs will land)</li>
              <li>Expected yield (number of that size the brew produces)</li>
            </UL>
            <P>
              Save. Your &ldquo;What to Brew&rdquo; table now shows that date as the Back In Stock By
              for the product+size — and if the yield covers the deficit, the Action column
              flips from <Code>Brew →</Code> to <Code>Brew Scheduled</Code>.
            </P>
            <H>When the brew lands</H>
            <P>
              Click <strong>Mark Complete</strong> on the scheduled row. Two things happen:
            </P>
            <OL>
              <li>The completed_at timestamp is set — the row drops out of the active schedule.</li>
              <li>The expected yield is <strong>automatically added to on-hand inventory</strong> for that product+size. No manual inventory bump needed.</li>
            </OL>
            <Note>
              If the actual yield differs from the expected (kegs lost during packaging,
              or an unexpectedly large brew), adjust the row&rsquo;s Expected Yield <em>before</em>
              marking complete so the inventory bump is correct — or mark complete and then
              use the +/− buttons on the Products page to reconcile.
            </Note>
          </>
        ),
      },
    ],
  },
  {
    id: 'kegs',
    title: 'Keg Tracker',
    articles: [
      {
        id: 'outstanding-kegs',
        title: 'What \u201coutstanding kegs\u201d means',
        body: (
          <>
            <P>
              Outstanding kegs = the number of physical kegs the brewery sent to a customer
              that haven&rsquo;t been returned yet. Every confirmed order posts deposit entries to
              the customer&rsquo;s keg ledger; every return request posts a negative entry. The
              balance per size is what&rsquo;s still out.
            </P>
            <P>
              The <AdminLink href="/admin/kegs">Keg Tracker</AdminLink> page is the brewery&rsquo;s central
              view of all balances. Each row is a customer, with per-size outstanding counts
              and a total deposit value (how much money the brewery would refund if all kegs
              came back today).
            </P>
          </>
        ),
      },
      {
        id: 'remind-return-deposit',
        title: 'Remind, Return, Deposit — the three row actions',
        body: (
          <>
            <UL>
              <li><strong>Remind</strong> — emails the customer asking them to submit a return request for their outstanding kegs.</li>
              <li><strong>Return</strong> — opens a modal to manually log a keg return (e.g. customer called and said &ldquo;I just dropped off 4 halves&rdquo;). Posts a return entry to their ledger. Use when the customer doesn&rsquo;t go through the portal.</li>
              <li><strong>Deposit</strong> — opens a modal to manually add a deposit entry (rare — mostly for bookkeeping corrections).</li>
            </UL>
          </>
        ),
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    articles: [
      {
        id: 'notification-recipients',
        title: 'Who gets brewery-side emails?',
        body: (
          <>
            <P>
              Brewery-facing notifications (new orders, new applications, low-stock alerts)
              go to the list of email addresses in <AdminLink href="/admin/settings">Settings</AdminLink> →
              <strong> Notification Recipients</strong>. Add as many as you want; remove the ones you
              don&rsquo;t.
            </P>
            <P>
              Customer-facing emails (order confirmation, invoice, keg reminder) always go
              to the customer&rsquo;s own email, not this list.
            </P>
            <Note>
              You must keep at least one recipient. The app refuses to save an empty list
              so brewery alerts never silently vanish.
            </Note>
          </>
        ),
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  PORTAL HELP CONTENT (customer-facing)
// ═══════════════════════════════════════════════════════════════════════════

export const PORTAL_HELP: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    articles: [
      {
        id: 'welcome',
        title: 'Welcome to the wholesale portal',
        body: (
          <>
            <P>
              This is where you place wholesale orders with Guidon Brewing Co., request keg
              returns, view invoices, and manage your account. Your account lives on this
              portal — no app to download, no logins to juggle.
            </P>
            <H>The five tabs</H>
            <UL>
              <li><strong>Overview</strong> — your dashboard. Current keg balances, recent orders, quick actions.</li>
              <li><strong>Browse &amp; Order</strong> — the beer catalog. Pick sizes, add to cart, submit.</li>
              <li><strong>Order History</strong> — every order you&rsquo;ve placed, with status.</li>
              <li><strong>Invoices</strong> — every invoice we&rsquo;ve sent. Download PDFs.</li>
              <li><strong>Account</strong> — update your contact info or change your password.</li>
            </UL>
          </>
        ),
      },
      {
        id: 'first-login',
        title: 'First login after approval',
        body: (
          <>
            <P>
              When your wholesale application is approved, the brewery sends you an email
              with a <strong>temporary password</strong>. Use it to sign in for the first time.
            </P>
            <P>
              On first login, the portal forces you to set a new password before anything
              else. This isn&rsquo;t optional — the temp password was emailed in plaintext and
              shouldn&rsquo;t stay in use. Pick something 6+ characters, type it twice (the eye
              icon lets you verify what you&rsquo;re typing), and hit <strong>Set password</strong>.
            </P>
            <Note>
              Lost the email? Go to the sign-in screen and click <strong>Forgot password?</strong>.
              Enter your email and a reset link will be on the way.
            </Note>
          </>
        ),
      },
      {
        id: 'signing-in',
        title: 'Signing in & forgot password',
        body: (
          <>
            <P>
              From the portal landing screen click <strong>Sign In</strong>. Enter your email and
              password. The eye icon next to the password field toggles visibility so you
              can double-check you&rsquo;re typing it right.
            </P>
            <P>
              If you forgot your password, click <strong>Forgot password?</strong> on the sign-in
              form. Enter your email and we&rsquo;ll send you a reset link. The link takes you to
              a page where you set a new password; that&rsquo;s immediately active — no extra
              step.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'ordering',
    title: 'Placing an order',
    articles: [
      {
        id: 'how-to-order',
        title: 'Step-by-step: placing your first order',
        body: (
          <>
            <OL>
              <li>Click the <strong>Browse &amp; Order</strong> tab.</li>
              <li>Find the beer you want. Each card shows the current price and deposit for the selected size.</li>
              <li>Click the <strong>size button</strong> (Half Barrel / Quarter Barrel / Sixth Barrel, or any custom size like &ldquo;Case of 16oz Cans&rdquo;). The price updates.</li>
              <li>Adjust the quantity with <Code>+</Code> / <Code>−</Code>.</li>
              <li>Click <strong>Add to Cart</strong>. The Review Cart button at the top updates.</li>
              <li>Repeat for each beer.</li>
              <li>When you&rsquo;re ready, click <strong>Review Cart · N · $Total</strong>.</li>
              <li>Optionally enter keg returns and a delivery note.</li>
              <li>Click <strong>Place Order</strong>. You&rsquo;ll see the order in your Order History immediately.</li>
            </OL>
          </>
        ),
      },
      {
        id: 'sizes-explained',
        title: 'Sizes: barrels, cases, cans \u2014 what\u2019s the difference?',
        body: (
          <>
            <P>
              Most beers are available in three keg sizes:
            </P>
            <UL>
              <li><strong>Half Barrel (1/2bbl)</strong> — ~165 pints / ~124 12oz servings.</li>
              <li><strong>Quarter Barrel (1/4bbl)</strong> — ~82 pints / ~62 servings.</li>
              <li><strong>Sixth Barrel (1/6bbl)</strong> — ~55 pints / ~41 servings. Often called a &ldquo;sixtel.&rdquo;</li>
            </UL>
            <P>
              Some beers also have <strong>custom sizes</strong> like &ldquo;Case of 16oz Cans&rdquo;, mixed
              packs, or 1-barrel specials. These show up as additional buttons on the beer
              card. Custom sizes usually have no keg deposit (they&rsquo;re not returnable).
            </P>
            <Note>
              A size button is <em>disabled + greyed out</em> if that size isn&rsquo;t currently offered
              for a beer, or is temporarily out of stock.
            </Note>
          </>
        ),
      },
      {
        id: 'delivery',
        title: 'Delivery schedule',
        body: (
          <>
            <P>
              Guidon Brewing Co. delivers <strong>Thursdays and Fridays</strong>. When you place an
              order, the portal auto-assigns the next available delivery day based on the
              current time and the brewery&rsquo;s production schedule.
            </P>
            <P>
              If you need a specific date (e.g. for an event), add a note to the order
              during checkout. The brewery will reach out if they need to move it.
            </P>
          </>
        ),
      },
      {
        id: 'emails',
        title: 'What emails will I receive?',
        body: (
          <>
            <UL>
              <li><strong>Order received</strong> — immediately when you place the order. Lists the items and tells you we&rsquo;ll email again when it&rsquo;s confirmed.</li>
              <li><strong>Order confirmed</strong> — when the brewery commits to the order. Includes the delivery date. An invoice follows right after.</li>
              <li><strong>Invoice</strong> — with payment terms. Payment is due on delivery or per your negotiated terms.</li>
              <li><strong>Keg return reminder</strong> — if we have kegs out from you for a while, the brewery may send a gentle nudge. You can put in a return request from the Overview tab.</li>
            </UL>
          </>
        ),
      },
    ],
  },
  {
    id: 'orders',
    title: 'Managing orders',
    articles: [
      {
        id: 'order-history',
        title: 'Finding past orders',
        body: (
          <>
            <P>
              The <strong>Order History</strong> tab shows every order you&rsquo;ve placed, newest first.
              Each row has the order ID, date, items summary, status badge, and total.
            </P>
            <P>
              Click an order to expand it and see the full line items, any keg returns, and
              delivery date.
            </P>
          </>
        ),
      },
      {
        id: 'cancel-order',
        title: 'Cancelling a pending order',
        body: (
          <>
            <P>
              You can cancel an order yourself <strong>while it&rsquo;s still pending</strong> (the brewery
              hasn&rsquo;t confirmed it yet). Find the order in Order History and click <strong>Cancel</strong>.
            </P>
            <Note>
              Once an order is confirmed, you can&rsquo;t self-cancel — the brewery has already
              reserved inventory. Contact the brewery directly (email the brewery team, or
              use the reply-to on your order confirmation email) and they&rsquo;ll void it for
              you.
            </Note>
          </>
        ),
      },
      {
        id: 'reorder',
        title: 'Reordering the same cart',
        body: (
          <>
            <P>
              Click <strong>Reorder Last</strong> on the Overview tab to rebuild your cart from your
              most recent order. Adjust quantities, add or remove beers, and submit — faster
              than starting from scratch for a regular standing order.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'kegs',
    title: 'Keg returns & deposits',
    articles: [
      {
        id: 'understanding-kegs',
        title: 'How keg deposits work',
        body: (
          <>
            <P>
              Every keg the brewery sends carries a <strong>refundable deposit</strong>. You pay the
              deposit on the invoice; the brewery holds it until you return the empty keg.
              Cases of cans and non-returnable packs have no deposit.
            </P>
            <P>
              On your <strong>Overview</strong> tab, <strong>Keg Balances</strong> shows how many kegs of each
              size we have out with you. Zero across the board means all returned.
            </P>
          </>
        ),
      },
      {
        id: 'requesting-return',
        title: 'Requesting a keg pickup',
        body: (
          <>
            <P>
              On the Overview tab click <strong>Request Keg Return</strong>. The modal lets you enter
              a quantity per size (e.g. 2 of Half Barrel, 1 of Sixth Barrel in one request) —
              you can return multiple sizes in a single form.
            </P>
            <OL>
              <li>Enter the quantity for each size you&rsquo;re returning. Leave sizes you aren&rsquo;t returning at 0.</li>
              <li>Optionally add a note (e.g. &ldquo;Ready at loading dock after 2pm Thursday&rdquo;).</li>
              <li>Click <strong>Submit Return</strong>.</li>
            </OL>
            <P>
              The brewery is notified. Returns typically align with your next delivery — we
              pick up empties when we drop off fulls.
            </P>
          </>
        ),
      },
      {
        id: 'deposit-refund',
        title: 'When do I get the deposit back?',
        body: (
          <>
            <P>
              Once the brewery logs the returned kegs against your account, the matching
              deposit comes off your outstanding AR — usually applied as a credit on your
              next invoice. The brewery will reach out if you have a credit balance that
              should be paid out differently.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'invoices',
    title: 'Invoices',
    articles: [
      {
        id: 'viewing',
        title: 'Viewing and downloading invoices',
        body: (
          <>
            <P>
              The <strong>Invoices</strong> tab lists every invoice on your account. Statuses:
            </P>
            <UL>
              <li><strong>Draft</strong> — internal to the brewery. You won&rsquo;t see these normally.</li>
              <li><strong>Unpaid</strong> — owed. Payment expected per your terms.</li>
              <li><strong>Paid</strong> — settled.</li>
              <li><strong>Overdue</strong> — past due. Please reach out to the brewery.</li>
            </UL>
            <P>
              Click an invoice to view or download a PDF.
            </P>
          </>
        ),
      },
      {
        id: 'payment',
        title: 'How do I pay?',
        body: (
          <>
            <P>
              Payment methods and terms depend on the arrangement you set up with the
              brewery (typical options: cash/check on delivery, ACH, or net-30 billing).
              Reach out to the brewery team if you&rsquo;d like to change your payment setup.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    articles: [
      {
        id: 'update-contact',
        title: 'Updating contact info',
        body: (
          <>
            <P>
              <strong>Account</strong> tab → <strong>Account Information</strong>. You can change your
              contact name, phone, and address. Business name and email are locked — contact
              the brewery if those need updating (usually indicates an ownership transfer or
              rebrand).
            </P>
          </>
        ),
      },
      {
        id: 'change-password',
        title: 'Changing your password',
        body: (
          <>
            <P>
              <strong>Account</strong> tab → <strong>Change Password</strong>. Enter a new password,
              confirm it, click <strong>Update Password</strong>. The change takes effect immediately —
              you stay signed in on this device, but future logins require the new password.
            </P>
          </>
        ),
      },
      {
        id: 'logout',
        title: 'Logging out',
        body: (
          <>
            <P>
              Top-right: <strong>Log Out</strong>. You&rsquo;ll be returned to the sign-in screen. Also
              available at the bottom of the Account tab.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: 'faq',
    title: 'FAQ',
    articles: [
      {
        id: 'can-i-order-cans',
        title: 'Can I order cans and mixed packs?',
        body: (
          <>
            <P>
              Yes — whenever the brewery has can or pack sizes available, they appear as
              additional size buttons on the beer card alongside the kegs. Pricing and
              deposits are per-size.
            </P>
          </>
        ),
      },
      {
        id: 'minimum-order',
        title: 'Is there a minimum order?',
        body: (
          <>
            <P>
              There&rsquo;s no hard minimum enforced by the portal — you can order as little as
              one sixth-barrel. That said, the brewery may set per-account minimums for
              cost-effective delivery routing; check with your account manager if in doubt.
            </P>
          </>
        ),
      },
      {
        id: 'order-leadtime',
        title: 'How fast can I get a delivery?',
        body: (
          <>
            <P>
              Orders placed early in the week typically deliver that Thursday or Friday.
              Late-week orders move to the following week&rsquo;s run. The portal auto-assigns
              the next feasible delivery date at checkout — if you need a different date,
              add a note and the brewery will coordinate.
            </P>
          </>
        ),
      },
      {
        id: 'contact',
        title: 'Who do I contact for help?',
        body: (
          <>
            <P>
              For wholesale account questions, email the brewery&rsquo;s sales team (the address
              on your invoice footer). For urgent day-of delivery issues, the order
              confirmation email has a reply-to that goes straight to the brewery.
            </P>
            <P>
              Guidon Brewing Co. · 415 8th Ave. E., Hendersonville, NC 28792 ·
              <a href="https://guidonbrewing.com" style={{ color: 'var(--brass)', marginLeft: 4 }}>guidonbrewing.com</a>
            </P>
          </>
        ),
      },
    ],
  },
];
