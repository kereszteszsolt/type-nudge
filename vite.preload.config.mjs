import { defineConfig } from 'vite';

// A sandboxed preload can require Electron, but cannot load local chunks.
export default defineConfig({
  build: {
    rollupOptions: {
      output: { format: 'cjs', codeSplitting: false, entryFileNames: 'preload.js' },
    },
  },
});
