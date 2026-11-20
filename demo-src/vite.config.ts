import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Builds the whole app into a single index.html (easy to host on GitHub Pages)
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist' },
})
