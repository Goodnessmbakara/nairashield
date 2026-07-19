const { heroui } = require("@heroui/react");
const path = require("path");

// HeroUI nests @heroui/theme under @heroui/react — the bare package path does not exist at the root.
const herouiTheme = path.dirname(
  require.resolve("@heroui/theme/package.json", {
    paths: [path.dirname(require.resolve("@heroui/react/package.json"))],
  }),
);

/** Midnight Signal blue — primary brand. */
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

/** Yield / HOLD — teal emerald. */
const successScale = {
  50: "#E8FBF3",
  100: "#C6F5E0",
  200: "#8EEBC4",
  300: "#4FD9A0",
  400: "#1FC47D",
  500: "#12A866",
  600: "#0C8A53",
  700: "#0A6E44",
  800: "#095738",
  900: "#07472E",
  DEFAULT: "#12A866",
  foreground: "#FFFFFF",
};

/** TRADE / urgency — warm amber. */
const warningScale = {
  50: "#FFF8EB",
  100: "#FFEEC7",
  200: "#FFD88A",
  300: "#FFBE4D",
  400: "#FFA41C",
  500: "#F08C00",
  600: "#C96E00",
  700: "#A35604",
  800: "#86450B",
  900: "#6E390C",
  DEFAULT: "#F08C00",
  foreground: "#1A1000",
};

/** Secondary accent — indigo violet for chips / secondary actions. */
const secondaryScale = {
  50: "#F0EEFF",
  100: "#E0DBFF",
  200: "#C5BAFF",
  300: "#A390FF",
  400: "#8360FF",
  500: "#6B3DFF",
  600: "#5828E8",
  700: "#481FC2",
  800: "#3B1B9C",
  900: "#2F1779",
  DEFAULT: "#6B3DFF",
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
            background: "#EEF4FF",
            foreground: "#0D111B",
            focus: "#006BBB",
            content1: "#FFFFFF",
            content2: "#EAF1FF",
            content3: "#DCE7FA",
            content4: "#C9D7F0",
            primary: primaryScale,
            secondary: secondaryScale,
            success: successScale,
            warning: warningScale,
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
            secondary: secondaryScale,
            success: successScale,
            warning: warningScale,
          },
        },
      },
    }),
  ],
};
