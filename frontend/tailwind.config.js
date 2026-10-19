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
        ocre: { DEFAULT: v("ocre"), ink: v("ocre-ink") },
        rail: { DEFAULT: v("rail"), ink: v("rail-ink"), soft: v("rail-soft") },
        pos: { DEFAULT: v("pos"), wash: v("pos-wash") },
        neg: { DEFAULT: v("neg"), wash: v("neg-wash") },
        warn: { DEFAULT: v("warn"), wash: v("warn-wash") },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        // Números e títulos: Archivo variável (eixos de peso e largura), com algarismos tabulares.
        figure: ['"Archivo Variable"', '"IBM Plex Sans"', "system-ui", "sans-serif"],
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
        "5xl": ["5.16rem", { lineHeight: "1" }],
      },
      borderRadius: { sm: "3px", DEFAULT: "6px", md: "8px", lg: "12px", xl: "16px" },
      boxShadow: {
        sheet: "0 1px 0 rgb(var(--rule) / 1)",
        lift: "0 1px 2px rgb(14 22 50 / 0.06), 0 8px 24px -12px rgb(14 22 50 / 0.18)",
        float: "0 18px 48px -12px rgb(8 14 40 / 0.38), 0 3px 10px rgb(8 14 40 / 0.14)",
      },
    },
  },
  plugins: [],
};
