import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'LEXICON_'), ...process.env }

  return {
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': { target: env.LEXICON_API_TARGET || 'http://127.0.0.1:8080', changeOrigin: false },
      },
    },
  }
})
