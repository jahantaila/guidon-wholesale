import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        charcoal: {
          DEFAULT: "#1A1A1A",
          50: "#f5f5f5",
          100: "#2a2a2a",
          200: "#333333",
          300: "#404040",
          400: "#555555",
          500: "#1A1A1A",
          600: "#151515",
          700: "#111111",
          800: "#0d0d0d",
          900: "#080808",
        },
        gold: {
          DEFAULT: "#D4A843",
          50: "#fdf8eb",
          100: "#f9edcc",
          200: "#f3d994",
          300: "#edc35c",
          400: "#D4A843",
          500: "#c49a2e",
          600: "#a67b23",
          700: "#845e1e",
          800: "#6b4a1c",
          900: "#573c19",
        },
        cream: {
          DEFAULT: "#F5F0E1",
          50: "#FDFCF7",
          100: "#F5F0E1",
          200: "#EDE4CA",
          300: "#e0d3a8",
        },
        olive: {
          DEFAULT: "#3D4F2F",
          50: "#f4f6f1",
          100: "#e6eadf",
          200: "#ced6c2",
          300: "#adb99b",
          400: "#8a9b74",
          500: "#6b7d56",
          600: "#536342",
          700: "#3D4F2F",
          800: "#354430",
          900: "#2d3a28",
        },
        brown: {
          DEFAULT: "#2C1810",
          50: "#f7f3f1",
          100: "#ede5df",
          200: "#dcc9bc",
          700: "#4a2e20",
          800: "#3b2318",
          900: "#2C1810",
        },
      },
      fontFamily: {
        heading: ["Playfair Display", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        stencil: ["Playfair Display", "Georgia", "serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out both",
        "slide-in": "slideIn 0.4s ease-out both",
        "slide-up": "slideUp 0.4s ease-out both",
        "slide-down": "slideDown 0.3s ease-out both",
        "scale-in": "scaleIn 0.3s ease-out both",
        "glow": "glow 2s ease-in-out infinite alternate",
        "shimmer": "shimmer 2s linear infinite",
        "count-up": "countUp 0.6s ease-out both",
        "pulse-gold": "pulseGold 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(212, 168, 67, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(212, 168, 67, 0.4)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        countUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "60%": { transform: "translateY(-2px)", opacity: "1" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseGold: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #D4A843 0%, #e8c86e 50%, #D4A843 100%)",
        "dark-gradient": "linear-gradient(180deg, #1A1A1A 0%, #111111 100%)",
        "hero-gradient": "linear-gradient(135deg, #1A1A1A 0%, #2a2a2a 50%, #1A1A1A 100%)",
        "card-gradient": "linear-gradient(145deg, #222222 0%, #1A1A1A 100%)",
      },
      boxShadow: {
        "gold": "0 0 15px rgba(212, 168, 67, 0.15)",
        "gold-lg": "0 0 30px rgba(212, 168, 67, 0.2)",
        "dark": "0 4px 20px rgba(0, 0, 0, 0.3)",
        "dark-lg": "0 8px 40px rgba(0, 0, 0, 0.5)",
        "inner-gold": "inset 0 1px 0 rgba(212, 168, 67, 0.1)",
      },
    },
  },
  plugins: [],
};
export default config;
