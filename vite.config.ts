import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
// @ts-expect-error Local build plugin runs in Node, outside the browser bundle.
import { offlineBundle } from './scripts/pwa.mjs';

// Choose only COMPLETE local bundles. Partial optional model installs must never
// generate 404 requests on every webcam start.
const offlineVision=['vision_bundle.mjs','wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_module_internal.js','wasm/vision_wasm_module_internal.wasm',
  'models/pose_landmarker_lite.task','models/hand_landmarker.task','models/face_landmarker.task']
  .every(file=>existsSync('public/mediapipe/'+file));
export default defineConfig({
  plugins: [react(), tailwind(), offlineBundle()],
  define: { __SIRVIBE_LOCAL_VISION__: JSON.stringify(offlineVision) },
  optimizeDeps: { include: ['@tybys/wasm-util', 'buffer', 'memfs-browser'] },
  worker: { format: 'es' }, build: { target: 'es2022' }
});
