import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El sitio se sirve en la raíz de https://ea-divisas.github.io/ (repo
// EA-DIVISAS/EA-DIVISAS.github.io). Ruteo por hash (#/...).
// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
})
