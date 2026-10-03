import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#ec4899", dark: "#db2777", light: "#fce7f3" },
        sakura: {
          50: "#fff1f5",
          100: "#ffe4ec",
          200: "#ffc8d6",
          300: "#ffb7c5",
          400: "#ff8fab",
          500: "#f472b6",
          600: "#ec4899",
          700: "#db2777",
          800: "#9d174d",
          900: "#831843",
        },
        nihongo: { bg: "#fff7f9", card: "#ffffff" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    }
  },
  plugins: []
};
export default config;
