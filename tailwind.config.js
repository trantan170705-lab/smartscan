/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        void: 'var(--bg-void)',
        panel: 'var(--bg-panel)',
        elevated: 'var(--bg-elevated)',
        hairline: 'var(--border-hairline)',
        active: 'var(--border-active)',
        laser: 'var(--accent-laser)',
        primary: 'var(--text-primary)',
        muted: 'var(--text-muted)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
