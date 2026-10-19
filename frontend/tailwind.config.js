/** @type {import('tailwindcss').Config} */
// Cores vêm de variáveis CSS (src/index.css), que mudam com o tema; aqui só ganham nomes semânticos.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: v("paper"),
        sheet: v("sheet"),
        sunk: v("sunk"),
        ink: { DEFAULT: v("ink"), soft: v("ink-soft"), faint: v("ink-faint") },
        rule: { DEFAULT: v("rule"), strong: v("rule-strong") },
        anil: { DEFAULT: v("anil"), strong: v("anil-strong"), wash: v("anil-wash"), ink: v("anil-ink") },
        pos: { DEFAULT: v("pos"), wash: v("pos-wash") },
        neg: { DEFAULT: v("neg"), wash: v("neg-wash") },
        warn: { DEFAULT: v("warn"), wash: v("warn-wash") },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        figure: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', "system-ui", "sans-serif"],
      },
      fontSize: {
        // escala modular (≈1,2) para uma interface densa; 14 px é o corpo de trabalho
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.3rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.2rem", { lineHeight: "1.65rem" }],
        xl: ["1.44rem", { lineHeight: "1.9rem" }],
        "2xl": ["1.728rem", { lineHeight: "2.1rem" }],
        "3xl": ["2.488rem", { lineHeight: "2.6rem" }],
        "4xl": ["3.583rem", { lineHeight: "3.6rem" }],
      },
      borderRadius: { sm: "3px", DEFAULT: "5px", md: "6px", lg: "10px" },
      boxShadow: {
        sheet: "0 1px 0 rgb(var(--rule) / 1)",
        float: "0 12px 32px -8px rgb(15 20 40 / 0.28), 0 2px 6px rgb(15 20 40 / 0.12)",
      },
      keyframes: {
        "sheet-in": { from: { transform: "translateX(24px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        "rise-in": { from: { transform: "translateY(16px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        "sheet-in": "sheet-in 200ms cubic-bezier(.2,.8,.2,1)",
        "rise-in": "rise-in 200ms cubic-bezier(.2,.8,.2,1)",
        "fade-in": "fade-in 150ms ease-out",
      },
    },
  },
  plugins: [],
};
