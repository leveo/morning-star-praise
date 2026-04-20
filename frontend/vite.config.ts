import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// The Remotion composition (WorshipVideo.tsx) lives in ../remotion/src/ so
// the Remotion CLI can bundle it for MP4 rendering. We also import it
// directly from the frontend for the @remotion/player embed. Vite's dev
// server blocks reads outside the project root by default, so whitelist
// the remotion project under server.fs.allow.
const REMOTION_DIR = path.resolve(__dirname, '../remotion')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@remotion-composition': path.resolve(REMOTION_DIR, 'src'),
      // Force a single React copy. WorshipVideo.tsx is imported from
      // ../remotion/src, which has its own node_modules/react — without
      // this alias, Vite can end up bundling two React instances and
      // every hook call inside the composition throws "Invalid hook call".
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom', 'remotion'],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname), REMOTION_DIR],
    },
    proxy: {
      '/api': 'http://localhost:8000',
      '/static': 'http://localhost:8000',
    },
  },
})
