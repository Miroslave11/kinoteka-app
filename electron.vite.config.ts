import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    define: {
      // Klíč aplikace u Googlu pro sdílení přes Google Disk (secrets KINOTEKA_GOOGLE_CLIENT_*).
      __KINOTEKA_GOOGLE_CLIENT_ID__: JSON.stringify(process.env['KINOTEKA_GOOGLE_CLIENT_ID'] ?? ''),
      __KINOTEKA_GOOGLE_CLIENT_SECRET__: JSON.stringify(
        process.env['KINOTEKA_GOOGLE_CLIENT_SECRET'] ?? ''
      )
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
