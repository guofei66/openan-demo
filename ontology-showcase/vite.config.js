import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.API_PORT || '8787'

export default defineConfig({
  plugins: [react()],
  // 部署在 nginx 子路径 /ontology-showcase/ 下（同源挂载），
  // 资源引用需要带该前缀，否则按根路径请求会 404。
  base: '/ontology-showcase/',
  server: {
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
})
