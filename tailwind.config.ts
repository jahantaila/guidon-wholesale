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
        amber: {
          DEFAULT: "#D4A843",
          50: "#fdf8eb",
          100: "#f9edcc",
          200: "#f3d994",
          300: "#edc35c",
          400: "#D4A843",
          500: "#d49a2e",
          600: "#bc7a23",
          700: "#9c5b20",
          800: "#804921",
          900: "#6a3c1f",
        },
        cream: {
          DEFAULT: "#F5F0E1",
          50: "#FDFCF7",
          100: "#F5F0E1",
          200: "#EDE4CA",
          300: "#e0d3a8",
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
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-in": "slideIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
