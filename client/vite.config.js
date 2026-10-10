import path from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const src = path.resolve(import.meta.dirname, 'src');

export default defineConfig({
  // Relative asset paths so the same build works under any host/path.
  base: './',
  plugins: [
    react({
      // Lingui v3 uses babel macros (`@lingui/macro`).
      babel: { plugins: ['macros'] },
    }),
  ],
  resolve: {
    // The CRA app imported from `src/` as a base dir (jsconfig baseUrl),
    // e.g. `import * as settings from 'state/settings'`.
    alias: [
      // The icon files are CommonJS; Vite 8 would hand back `{ default }`
      // objects for them, so use the package's ESM copies instead.
      { find: /^@material-ui\/icons\/(\w+)$/, replacement: '@material-ui/icons/esm/$1' },
      // Browser polyfills for Node built-ins used by nedb (local DB).
      { find: /^util\/?$/, replacement: 'util/' },
      { find: /^path$/, replacement: 'path-browserify' },
      // Code shared with the server (repo-root shared/).
      { find: /^shared\/(.*)$/, replacement: path.resolve(import.meta.dirname, '../shared/$1') },
      { find: /^(polyfills|App|App\.css|state|network|route|components|utils|locales|assets|vendor)(\/.*)?$/, replacement: `${src}/$1$2` },
    ],
  },
  define: {
    // Values CRA used to inject.
    'process.env.REACT_APP_VERSION': JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
    // Allow serving ../shared in dev.
    fs: { allow: ['..'] },
    // Dev: forward API and WebSocket to the game server (server/, port 8090)
    proxy: {
      // Keep the browser's Host header so invite links use the address you browsed to
      '/api': { target: 'http://127.0.0.1:8090', changeOrigin: false },
      '/ws': { target: 'ws://127.0.0.1:8090', ws: true, changeOrigin: false },
    },
  },
  optimizeDeps: {
    // Same as build.rolldownOptions below, for the dev-server pre-bundle.
    rolldownOptions: { shimMissingExports: true },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
    rolldownOptions: {
      // @material-ui/pickers (via material-table) re-exports TypeScript-only
      // type names; webpack ignored those, rolldown needs to be told to.
      shimMissingExports: true,
    },
  },
});
