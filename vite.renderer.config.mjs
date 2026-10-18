import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { license: { fileName: 'third-party-licenses.md' } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  plugins: [{
    name: 'local-development-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (!context.server) return html;
        const origin = new URL(context.server.resolvedUrls.local[0]).origin;
        const socket = origin.replace('http:', 'ws:');
        return html.replace("connect-src 'none'", `connect-src ${origin} ${socket}`);
      },
    },
  }],
});
