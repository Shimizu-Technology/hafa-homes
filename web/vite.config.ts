import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Mapbox GL is intentionally lazy-loaded into its own chunk for the map view.
    // Keep CI/build output focused on actionable regressions instead of warning on that vendor bundle.
    chunkSizeWarningLimit: 1800,
  },
})
