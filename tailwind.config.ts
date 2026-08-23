/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  safelist: [
    "animate-spin-slow", "animate-spin-slow-reverse", "animate-pulse", "animate-float", "animate-pulse-glow", "animate-gradient-xy",
    { pattern: /from-(indigo|blue|violet|purple|fuchsia|pink|rose|red|orange|yellow|amber|cyan|sky)-(400|500|600)(\/(50|70|80|90))?/ },
    { pattern: /to-(indigo|blue|violet|purple|fuchsia|pink|rose|red|orange|yellow|amber|cyan|sky)-(400|500|600)(\/(50|70|80|90))?/ },
    { pattern: /via-(indigo|blue|violet|purple|fuchsia|pink|rose|red|orange|yellow|amber|cyan|sky)-(400|500|600)(\/(50|70|80|90))?/ },
    { pattern: /bg-(indigo|blue|violet|purple|fuchsia|pink|rose|red|orange|yellow|amber|cyan|sky)-(400|500|600)(\/(50|70|80|90))?/ },
    { pattern: /border-(indigo|blue|violet|purple|fuchsia|pink|rose|red|orange|yellow|amber|cyan|sky)-(400|500|600)(\/(50|70|80|90))?/ },
  ],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
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
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        serif: ["Playfair Display", "serif"],
      },
      keyframes: {
        'gradient-xy': {
          '0%, 100%': {
            'background-size': '400% 400%',
            'background-position': 'left center'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center'
          }
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.02)' },
        }
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'spin-slow-reverse': 'spin 12s linear infinite reverse',
        'gradient-xy': 'gradient-xy 3s ease infinite',
        'shimmer': 'shimmer 2s infinite linear',
        'float': 'float 3s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
}
// Cache bust 1
