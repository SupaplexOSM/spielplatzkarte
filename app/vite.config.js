import { defineConfig, createLogger } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// config.js is intentionally a plain (non-module) script: it sets window.APP_CONFIG
// before the Svelte app boots, and docker-entrypoint.sh overwrites it at container
// start-up to inject runtime values. Suppress the Vite "can't be bundled" warning.
const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, opts) => {
  if (msg.includes("can't be bundled without type=\"module\" attribute")) return;
  originalWarn(msg, opts);
};

export default defineConfig({
  customLogger: logger,
  plugins: [svelte()],
  css: {
    postcss: './postcss.config.js',
  },
  build: {
    sourcemap: true,
  },
  server: {
    host: true, // bind to 0.0.0.0 so the app is reachable on the local network
  },
});
