import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Výchozí prostředí je Node; testy komponent si přepnou na happy-dom komentářem.
    environment: 'node'
  }
})
