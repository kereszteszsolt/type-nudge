import { VitePlugin } from '@electron-forge/plugin-vite';

export default {
  packagerConfig: {
    asar: true,
    executableName: 'type-nudge',
    extraResource: ['LICENSE'],
  },
  plugins: [new VitePlugin({
    build: [
      { entry: 'src/main/index.ts', config: 'vite.main.config.mjs', target: 'main' },
      { entry: 'src/preload.ts', config: 'vite.preload.config.mjs', target: 'preload' },
    ],
    renderer: [{ name: 'main_window', config: 'vite.renderer.config.mjs' }],
  })],
};
