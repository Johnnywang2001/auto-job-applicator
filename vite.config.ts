import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        background: resolve(__dirname, 'src/background.ts'),
        linkedin: resolve(__dirname, 'src/content/linkedin.ts'),
        formScraper: resolve(__dirname, 'src/content/form-scraper.ts'),
        statusDetector: resolve(__dirname, 'src/content/status-detector.ts'),
        careerPage: resolve(__dirname, 'src/content/career-page.ts'),
        loginDetector: resolve(__dirname, 'src/content/login-detector.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js'
          if (chunk.name === 'linkedin') return 'content/linkedin.js'
          if (chunk.name === 'formScraper') return 'content/form-scraper.js'
          if (chunk.name === 'statusDetector') return 'content/status-detector.js'
          if (chunk.name === 'careerPage') return 'content/career-page.js'
          if (chunk.name === 'loginDetector') return 'content/login-detector.js'
          return 'assets/[name].js'
        },
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
})
