/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        console: {
          bg: "#0B0F17",
          card: "#121A27",
          border: "#1E293B",
          accent: "#0284C7",
          warning: "#F59E0B",
          critical: "#EF4444",
          success: "#10B981",
          muted: "#64748B"
        }
      }
    },
  },
  plugins: [],
}

