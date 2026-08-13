import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Custom domain (e.g. paperkit.com): leave unset or set VITE_BASE_PATH=/
// GitHub project site (username.github.io/repo-name): set VITE_BASE_PATH=/repo-name/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'

  return {
    base,
    plugins: [react(), tailwindcss()],
  }
})
