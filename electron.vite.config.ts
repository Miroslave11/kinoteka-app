import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // Klíč jen pro čtení soukromého repozitáře s vydáními (kinoteka-vydani). Vkládá ho workflow
    // Vydání ze secretu KINOTEKA_UPDATE_TOKEN; ve vývoji a v CI je prázdný.
    define: {
      __KINOTEKA_UPDATE_TOKEN__: JSON.stringify(process.env['KINOTEKA_UPDATE_TOKEN'] ?? '')
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        // Dvě stránky: hlavní okno a ovládání přehrávače nad obrazem mpv.
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    }
  }
})
