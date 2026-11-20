import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': { target: process.env.LEXICON_API_TARGET || 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
})
