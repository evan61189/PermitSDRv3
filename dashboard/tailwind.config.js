/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Clipper Construction Brand Colors
        clipper: {
          gold: '#F9A825',
          'gold-light': '#FFF8E1',
          'gold-dark': '#F57F17',
          navy: '#2D3436',
          'navy-light': '#636E72',
          'navy-dark': '#1E272E',
        },
        // Opportunity Rating Colors
        hot: {
          DEFAULT: '#dc2626',
          light: '#fef2f2',
        },
        warm: {
          DEFAULT: '#f59e0b',
          light: '#fffbeb',
        },
        cold: {
          DEFAULT: '#3b82f6',
          light: '#eff6ff',
        },
      },
    },
  },
  plugins: [],
}
