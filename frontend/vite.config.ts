import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Backend (root workspace) keeps its own .env with API_PORT (defaults to 3000,
// see src/config/config.ts) — reused here instead of duplicating the value.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, rootDir, '')
  const apiPort = rootEnv.API_PORT || '3000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
