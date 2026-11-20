import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({ plugins: [react(), tailwind()], optimizeDeps: { include: ['@tybys/wasm-util', 'buffer', 'memfs-browser'] }, worker: { format: 'es' }, build: { target: 'es2022' } });
