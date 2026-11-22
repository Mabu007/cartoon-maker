import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
// @ts-expect-error Local build plugin runs in Node, outside the browser bundle.
import { offlineBundle } from './scripts/pwa.mjs';

export default defineConfig({ plugins: [react(), tailwind(), offlineBundle()], optimizeDeps: { include: ['@tybys/wasm-util', 'buffer', 'memfs-browser'] }, worker: { format: 'es' }, build: { target: 'es2022' } });
