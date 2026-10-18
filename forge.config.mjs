import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

export default {
  // better-sqlite3 13 ships Node-API prebuilds; Forge's legacy detection rebuilds it unnecessarily.
  rebuildConfig: { ignoreModules: ['better-sqlite3'] },
  packagerConfig: {
    asar: true,
    executableName: 'type-nudge',
    extraResource: ['LICENSE'],
    // Vite bundles JS; retain only the external native package and its dependency.
    ignore: (file) => file !== '' && file !== '/node_modules' &&
      !/^\/\.vite(?:\/|$)/.test(file) &&
      !/^\/node_modules\/(better-sqlite3|node-addon-api)(?:\/|$)/.test(file),
  },
  plugins: [new AutoUnpackNativesPlugin({}), new VitePlugin({
    build: [
      { entry: 'src/main/index.ts', config: 'vite.main.config.mjs', target: 'main' },
      { entry: 'src/preload.ts', config: 'vite.preload.config.mjs', target: 'preload' },
    ],
    renderer: [{ name: 'main_window', config: 'vite.renderer.config.mjs' }],
  })],
};
