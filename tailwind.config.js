/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./dashboard.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#FAFAF9',
        surface: '#FFFFFF',
        'surface-muted': '#F5F5F4',
        'text-primary': '#1C1917',
        'text-secondary': '#78716C',
        border: '#E7E5E4',
        accent: {
          teal: '#0D9488',
          'teal-light': '#CCFBF1',
          orange: '#F97316',
          'orange-light': '#FFEDD5',
          lime: '#84CC16',
          'lime-light': '#ECFCCB',
          red: '#EF4444',
          'red-light': '#FEE2E2',
        }
      }
    },
  },
  plugins: [],
}
