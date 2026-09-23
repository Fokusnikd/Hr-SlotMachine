import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Для GitHub Pages (проектная страница) сайт живёт по /<repo>/, а не по корню — задаём через env в CI.
  base: process.env.GITHUB_PAGES_BASE || '/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    environment: 'node',
  },
} as any)
