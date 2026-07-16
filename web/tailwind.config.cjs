const { heroui } = require("@heroui/react");
const path = require("path");

// HeroUI nests @heroui/theme under @heroui/react — the bare package path does not exist at the root.
const herouiTheme = path.dirname(
  require.resolve("@heroui/theme/package.json", {
    paths: [path.dirname(require.resolve("@heroui/react/package.json"))],
  }),
);

/** Midnight Signal — light + dark. Light is the default product surface. */
const primaryScale = {
  50: "#E8F3FF",
  100: "#D1E7FF",
  200: "#AED5FF",
  300: "#82C0FF",
  400: "#50A9FF",
  500: "#0083E0",
  600: "#006BBB",
  700: "#00569F",
  800: "#004984",
  900: "#00315E",
  DEFAULT: "#006BBB",
  foreground: "#FFFFFF",
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,astro,mdx}",
    // Scan theme slots so utilities like `sr-only` used only inside HeroUI are emitted.
    path.join(herouiTheme, "dist/**/*.{js,ts,jsx,tsx}"),
  ],
  safelist: [
    // Hard guarantee: NavbarMenuToggle labels must never paint on screen.
    "sr-only",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Premium product pair (not Inter/system defaults)
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Sora"', '"Plus Jakarta Sans"', "ui-sans-serif", "sans-serif"],
      },
      backgroundImage: {
        "hero-section-title": "linear-gradient(91deg, var(--tw-gradient-stops))",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "0.85" },
        },
        // Design ProMax scrolling-banner
        // ProMax: -50% minus half gap for seamless flex gap tracks
        "scrolling-banner": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-50% - var(--gap) / 2))" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out both",
        "pulse-soft": "pulse-soft 3s ease-in-out infinite",
        "scrolling-banner": "scrolling-banner var(--duration) linear infinite",
      },
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      defaultTheme: "light",
      themes: {
        light: {
          colors: {
            background: "#F5F8FF",
            foreground: "#0D111B",
            focus: "#006BBB",
            content1: "#FFFFFF",
            content2: "#F2F5FB",
            content3: "#E8EBF1",
            content4: "#DBDEE3",
            primary: primaryScale,
          },
        },
        dark: {
          colors: {
            background: "#060911",
            foreground: "#EEF2F9",
            focus: "#50A9FF",
            content1: "#0F141D",
            content2: "#181E2A",
            content3: "#222937",
            content4: "#2C3445",
            primary: {
              50: "#001F43",
              100: "#00315E",
              200: "#004984",
              300: "#0062AC",
              400: "#0083E0",
              500: "#50A9FF",
              600: "#82C0FF",
              700: "#AED5FF",
              800: "#D1E7FF",
              900: "#E8F3FF",
              DEFAULT: "#50A9FF",
              foreground: "#030303",
            },
          },
        },
      },
    }),
  ],
};
