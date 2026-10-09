import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const v = JSON.parse(readFileSync(fileURLToPath(new URL('../../version.json', import.meta.url)), 'utf8')) as { version: string; stage: number };

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(v.version),
    __APP_STAGE__: JSON.stringify(v.stage),
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  server: { port: 5173, host: true },
  preview: { port: 4173 },
});
