import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  // Optimized content paths - only scan necessary files
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  // Safelist commonly used dynamic classes
  safelist: [
    'animate-spin',
    'animate-pulse',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        body: ['Lora', 'Georgia', 'serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          hover: "hsl(var(--gold-hover))",
          light: "hsl(var(--gold-light))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Facebook Reactions
        reaction: {
          like: "hsl(var(--reaction-like))",
          love: "hsl(var(--reaction-love))",
          haha: "hsl(var(--reaction-haha))",
          wow: "hsl(var(--reaction-wow))",
          sad: "hsl(var(--reaction-sad))",
          angry: "hsl(var(--reaction-angry))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "50%": { transform: "scale(1.2)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px hsl(var(--primary-glow)/0.6), inset 0 1px 0 rgba(255,255,255,0.3)" },
          "50%": { boxShadow: "0 0 35px hsl(var(--primary-glow)/0.8), 0 0 50px hsl(var(--gold)/0.4), inset 0 1px 0 rgba(255,255,255,0.5)" },
        },
        "glow-radiate": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(255, 215, 0, 0.4), 0 0 40px rgba(255, 215, 0, 0.2)" },
          "50%": { boxShadow: "0 0 40px rgba(255, 215, 0, 0.6), 0 0 80px rgba(255, 215, 0, 0.4)" },
        },
        "sparkle-float": {
          "0%": { opacity: "0", transform: "translateY(0) scale(0)" },
          "50%": { opacity: "1", transform: "translateY(-20px) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-40px) scale(0)" },
        },
        "fall": {
          "0%": { transform: "translateY(-100vh) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(100vh) rotate(720deg)", opacity: "0" },
        },
        "spin-slow": {
          "from": { transform: "rotate(0deg)" },
          "to": { transform: "rotate(360deg)" },
        },
        "sparkle": {
          "0%, 100%": { opacity: "0", transform: "scale(0)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
        "rich-float": {
          "0%": { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", opacity: "0.8" },
          "25%": { transform: "translateY(-50px) translateX(30px) rotate(15deg) scale(1.8)", opacity: "1" },
          "50%": { transform: "translateY(-20px) translateX(-25px) rotate(-10deg) scale(0.9)", opacity: "0.9" },
          "75%": { transform: "translateY(-80px) translateX(20px) rotate(20deg) scale(1.5)", opacity: "1" },
          "100%": { transform: "translateY(0) translateX(0) rotate(0deg) scale(1)", opacity: "0.8" },
        },
        "float-up": {
          "0%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-120px) scale(1.5)" },
        },
        "float-coin": {
          "0%": { transform: "translateY(0) translateX(0) rotate(0deg)", opacity: "0.6" },
          "20%": { transform: "translateY(-12px) translateX(8px) rotate(15deg)", opacity: "0.9" },
          "40%": { transform: "translateY(-5px) translateX(-6px) rotate(-10deg)", opacity: "0.7" },
          "60%": { transform: "translateY(-18px) translateX(10px) rotate(20deg)", opacity: "1" },
          "80%": { transform: "translateY(-8px) translateX(-8px) rotate(-15deg)", opacity: "0.8" },
          "100%": { transform: "translateY(0) translateX(0) rotate(0deg)", opacity: "0.6" },
        },
        "sparkle-coin": {
          "0%": { opacity: "0.4", transform: "scale(0.9) translateY(0) rotate(0deg)" },
          "25%": { opacity: "1", transform: "scale(1.2) translateY(-10px) rotate(12deg)" },
          "50%": { opacity: "0.7", transform: "scale(1) translateY(-6px) rotate(-8deg)" },
          "75%": { opacity: "1", transform: "scale(1.15) translateY(-14px) rotate(15deg)" },
          "100%": { opacity: "0.4", transform: "scale(0.9) translateY(0) rotate(0deg)" },
        },
        "scroll-x": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pet-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "pet-aura": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "bounce-in": "bounce-in 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "shimmer": "shimmer 3s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "glow-radiate": "glow-radiate 2s ease-in-out infinite",
        "sparkle-float": "sparkle-float 2s ease-in-out infinite",
        "fall": "fall 4s linear forwards",
        "spin-slow": "spin-slow 3s linear infinite",
        "sparkle": "sparkle 1.5s ease-in-out infinite",
        "rich-float": "rich-float 2s ease-in-out infinite",
        "float-up": "float-up 2s ease-out forwards",
        "float-coin": "float-coin 3s ease-in-out infinite",
        "sparkle-coin": "sparkle-coin 2s ease-in-out infinite",
        "scroll-x": "scroll-x 40s linear infinite",
        "pet-float": "pet-float 3s ease-in-out infinite",
        "pet-aura": "pet-aura 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("tailwind-scrollbar")],
} satisfies Config;
