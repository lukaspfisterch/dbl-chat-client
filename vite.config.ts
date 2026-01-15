import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/capabilities': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
      '/ingress': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
      '/snapshot': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
      '/tail': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
        sse: true,
      }
    }
  }
})
