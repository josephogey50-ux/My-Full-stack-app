import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '5173'),
  },
  preview: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '4173'),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
