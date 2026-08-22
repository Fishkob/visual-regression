import type { Config } from "tailwindcss";

const config: Config = {
  extend: {
    animation: {
      "fade-in": "fadeIn 0.25s ease-out",
    },
    keyframes: {
      fadeIn: {
        "0%": { opacity: 0, transform: "translateY(4px)" },
        "100%": { opacity: 1, transform: "translateY(0)" },
      },
    },
  },
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
