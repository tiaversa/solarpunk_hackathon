import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        leaf: {
          50: "#f1faec",
          100: "#dff3d2",
          500: "#5aa84a",
          600: "#4a8d3c",
          700: "#3a6e30",
        },
        sun: {
          400: "#f5c451",
          500: "#e9ad27",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
