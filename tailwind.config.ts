import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Solarpunk palette driven by CSS variables (see app/globals.css) so a
        // light theme can swap values at runtime. Channels are stored as
        // "R G B" triplets and wrapped here to keep Tailwind /opacity modifiers
        // (e.g. text-solar-sage/70) working.
        solar: {
          bg: "rgb(var(--solar-bg) / <alpha-value>)", // page background
          panel: "rgb(var(--solar-panel) / <alpha-value>)", // raised surface / cards
          field: "rgb(var(--solar-field) / <alpha-value>)", // input fill / translucent field
          leafdk: "rgb(var(--solar-leafdk) / <alpha-value>)", // leaf shadow / inactive
          leafmd: "rgb(var(--solar-leafmd) / <alpha-value>)", // mid leaf / borders
          line: "rgb(var(--solar-line) / <alpha-value>)", // dividers, muted accents
          moss: "rgb(var(--solar-moss) / <alpha-value>)", // mid green
          green: "rgb(var(--solar-green) / <alpha-value>)", // primary / active green
          sage: "rgb(var(--solar-sage) / <alpha-value>)", // primary text
          cream: "rgb(var(--solar-cream) / <alpha-value>)", // emphasized / heading text
          danger: "rgb(var(--solar-danger) / <alpha-value>)", // destructive red
        },
        // Kept as aliases so any stray references still resolve to the
        // new palette rather than the old light theme.
        leaf: {
          50: "rgb(var(--solar-leafdk) / <alpha-value>)",
          100: "rgb(var(--solar-leafmd) / <alpha-value>)",
          500: "rgb(var(--solar-green) / <alpha-value>)",
          600: "rgb(var(--solar-green) / <alpha-value>)",
          700: "rgb(var(--solar-sage) / <alpha-value>)",
        },
        sun: {
          400: "#f5c451",
          500: "#e9ad27",
        },
      },
      fontFamily: {
        // Source Code Pro everywhere — matches the design spec. Loaded via
        // next/font in app/layout.tsx and exposed as --font-mono.
        sans: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        field: "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
