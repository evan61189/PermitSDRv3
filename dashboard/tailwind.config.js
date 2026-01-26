/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
