import type { Config } from "tailwindcss";

// Letterpress Trade Portal design system — see DESIGN.md
// Color names kept as-is (charcoal/gold/cream/olive/amber/brown) for backwards-
// compat with existing class usages, but all hex values are remapped to the new
// cream-paper + brass + olive palette. A follow-up commit should rename semantic
// classes (bg-charcoal → bg-paper, text-cream → text-ink, text-gold → text-brass)
// once the aesthetic is validated.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  // Status badge classes are built dynamically in getStatusColor
  // (`badge-status-${status}`). Tailwind's purge can't see the concatenation
  // so it strips these from the production CSS and badges render with
  // only .badge-sm base styling — invisible text on cream. Explicit
  // safelist keeps every valid status variant.
  safelist: [
    'badge-status-pending',
    'badge-status-confirmed',
    'badge-status-completed',
    'badge-status-cancelled',
    'badge-status-draft',
    'badge-status-paid',
    'badge-status-unpaid',
    'badge-status-overdue',
    'badge-status-approved',
    'badge-status-rejected',
    'badge-status-default',
  ],
  theme: {
    extend: {
      colors: {
        // `charcoal` is now the paper/surface palette. `DEFAULT` is the primary
        // page background. Darker "shades" are elevated surfaces and rules.
        charcoal: {
          DEFAULT: "#F5EFDF", // --paper
          50: "#FBF7EA",
          100: "#EEE5CE", // --surface (previously "elevated dark"; now "cardstock")
          200: "#E5DABE", // card hover
          300: "#D8CDA8", // --divider
          400: "#C5B78D", // stronger rule
          500: "#F5EFDF",
          600: "#EEE5CE",
          700: "#E5DABE",
          800: "#D8CDA8",
          900: "#C5B78D",
        },
        // `cream` is now the ink palette (foreground text).
        cream: {
          DEFAULT: "#2A2416", // --ink
          50: "#F5EFDF",
          100: "#2A2416", // --ink
          200: "#3A3220", // slightly lighter ink
          300: "#6B5F48", // --muted
          400: "#9B8D6F", // --faint
        },
        // `gold` is now the brass palette (weathered amber accent).
        gold: {
          DEFAULT: "#9E7A3B", // --brass
          50: "#F5EFDF",
          100: "#E8D9AC",
          200: "#C8A868",
          300: "#B2924D",
          400: "#9E7A3B", // --brass (primary)
          500: "#7C5F2E", // --brass-dim
          600: "#634B24",
          700: "#4A381B",
          800: "#332612",
          900: "#1F170B",
        },
        // `olive` kept (matches the Guidon brand color in both systems).
        olive: {
          DEFAULT: "#3D4F2F",
          50: "#EAEDE2",
          100: "#C7CFB2",
          200: "#9AA87C",
          300: "#6E8250",
          400: "#556842",
          500: "#3D4F2F", // primary
          600: "#2C3921", // --olive-dim
          700: "#202918",
          800: "#151B10",
          900: "#0B0E08",
        },
        // `amber` repurposed as --ember (warning tone).
        amber: {
          DEFAULT: "#B8793A",
          50: "#F4E2C6",
          100: "#EFCE9E",
          200: "#DDAB6B",
          300: "#C89449",
          400: "#B8793A",
          500: "#9A6030",
        },
        // `brown` removed in spirit but shades repointed to muted ink for any
        // straggler references.
        brown: {
          DEFAULT: "#2A2416",
          50: "#6B5F48",
          100: "#554A37",
          200: "#403828",
          300: "#2A2416",
          400: "#1E1910",
          500: "#14110A",
        },
        // New semantic colors introduced by DESIGN.md.
        paper: "#F5EFDF",
        surface: "#EEE5CE",
        divider: "#D8CDA8",
        ink: "#2A2416",
        muted: "#6B5F48",
        faint: "#9B8D6F",
        brass: {
          DEFAULT: "#9E7A3B",
          dim: "#7C5F2E",
        },
        ruby: "#8C3B2E", // destructive (rust)
        pine: "#2F5436", // success (forest)
        ember: "#B8793A", // warning (glowing amber)
      },
      fontFamily: {
        // Display/Hero — letterpress serif with opsz variable axis
        heading: ["Fraunces", "Georgia", "serif"],
        display: ["Fraunces", "Georgia", "serif"],
        // Body — reading serif
        body: ["Source Serif 4", "Georgia", "serif"],
        serif: ["Source Serif 4", "Georgia", "serif"],
        // UI — small sans for labels, buttons, nav
        ui: ["Instrument Sans", "system-ui", "sans-serif"],
        sans: ["Instrument Sans", "system-ui", "sans-serif"],
        // Data — tabular numerals for tables and pricing
        data: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        // Code — monospaced accents
        mono: ["Geist Mono", "JetBrains Mono", "monospace"],
      },
      fontSize: {
        display: [
          "4.5rem",
          { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "500" },
        ],
        "display-sm": [
          "3rem",
          { lineHeight: "1.05", letterSpacing: "-0.015em", fontWeight: "500" },
        ],
      },
      animation: {
        // Only loading state animation survives. All entrance animations removed
        // per DESIGN.md motion rules (minimal-functional only).
        "pulse-slow": "pulseSlow 3s ease-in-out infinite",
      },
      keyframes: {
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      backgroundImage: {
        // Paper-grain texture applied sparingly for tactile feel.
        grain:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E\")",
      },
      boxShadow: {
        // No neon shadows, no glows. Just soft elevation for modals.
        sm: "0 1px 2px rgba(42, 36, 22, 0.08)",
        DEFAULT: "0 2px 4px rgba(42, 36, 22, 0.08)",
        md: "0 4px 8px rgba(42, 36, 22, 0.08)",
        lg: "0 8px 16px rgba(42, 36, 22, 0.10)",
      },
      borderRadius: {
        // Subtle radii only. No rounded-xl/2xl/3xl anywhere in DESIGN.md.
        none: "0",
        sm: "2px",
        DEFAULT: "3px",
        md: "4px",
        lg: "6px",
        xl: "6px", // kept as alias, clamped small
        "2xl": "8px", // kept as alias, clamped small
        "3xl": "8px",
        full: "9999px", // avatars only
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
      },
    },
  },
  plugins: [],
};
export default config;
