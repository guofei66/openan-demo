import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/openan-playground/',
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      '/openan-playground/api': {
        target: 'http://127.0.0.1:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openan-playground\/api/, '/api'),
      },
      '/openan-playground/a2a': { target: 'http://127.0.0.1:9000', changeOrigin: true },
    },
  },
})
