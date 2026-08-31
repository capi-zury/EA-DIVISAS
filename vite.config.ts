import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' → las rutas de assets son relativas, así funciona igual servido
// en la raíz o dentro de un subpath (GitHub Pages: usuario.github.io/ea-divisas/).
// El ruteo de la app es por hash (#/...), no depende del subpath.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
})
