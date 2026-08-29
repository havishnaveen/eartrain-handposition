import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    // VexFlow is intentionally isolated and is just under 1 MB minified;
    // warn above that known boundary so future first-party regressions remain
    // visible without emitting a false alarm on every production build.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/vexflow/')) return 'notation'
          if (id.includes('/@supabase/') || id.includes('/@tanstack/')) return 'data'
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
