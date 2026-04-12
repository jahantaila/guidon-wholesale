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
          DEFAULT: "#040404",
          50: "#f5f5f5",
          100: "#111111",
          200: "#1a1a1a",
          300: "#222222",
          400: "#333333",
          500: "#040404",
          600: "#030303",
          700: "#020202",
          800: "#010101",
          900: "#000000",
        },
        gold: {
          DEFAULT: "#F3CA2C",
          50: "#fffde7",
          100: "#fff9c4",
          200: "#fff176",
          300: "#ffe43a",
          400: "#F3CA2C",
          500: "#d4a800",
          600: "#b08800",
          700: "#8a6a00",
          800: "#6d5300",
          900: "#574200",
        },
        cream: {
          DEFAULT: "#FFFFFF",
          50: "#FFFFFF",
          100: "#F5F5F5",
          200: "#E5E5E5",
          300: "#D4D4D4",
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
        heading: ["Outfit", "system-ui", "sans-serif"],
        body: ["Roboto", "system-ui", "sans-serif"],
        stencil: ["Outfit", "system-ui", "sans-serif"],
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
          "0%": { boxShadow: "0 0 5px rgba(243, 202, 44, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(243, 202, 44, 0.4)" },
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
        "gold-gradient": "linear-gradient(135deg, #F3CA2C 0%, #ffe43a 50%, #F3CA2C 100%)",
        "dark-gradient": "linear-gradient(180deg, #040404 0%, #000000 100%)",
        "hero-gradient": "linear-gradient(135deg, #040404 0%, #111111 50%, #040404 100%)",
        "card-gradient": "linear-gradient(145deg, #111111 0%, #040404 100%)",
      },
      boxShadow: {
        "gold": "0 0 15px rgba(243, 202, 44, 0.2)",
        "gold-lg": "0 0 30px rgba(243, 202, 44, 0.25)",
        "dark": "0 4px 20px rgba(0, 0, 0, 0.5)",
        "dark-lg": "0 8px 40px rgba(0, 0, 0, 0.7)",
        "inner-gold": "inset 0 1px 0 rgba(243, 202, 44, 0.15)",
      },
    },
  },
  plugins: [],
};
export default config;
