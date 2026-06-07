import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

function createApiResponse(res) {
  return {
    setHeader: (...args) => res.setHeader(...args),
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify(payload));
      return this;
    },
    end(payload = '') {
      res.end(payload);
      return this;
    },
  };
}

function localMarketApiPlugin() {
  return {
    name: 'local-market-api',
    configureServer(server) {
      server.middlewares.use('/api/market', async (req, res) => {
        try {
          const moduleUrl = new URL(`./api/market.js?t=${Date.now()}`, import.meta.url).href;
          const { default: handler } = await import(moduleUrl);
          await handler(req, createApiResponse(res));
        } catch (error) {
          console.error('[local-market-api]', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Local market API failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    localMarketApiPlugin(),
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
      ],
      manifest: {
        name: 'InvestBrain - 投资大脑',
        short_name: 'InvestBrain',
        description: '本地优先的投资决策闭环系统',
        theme_color: '#0a0e17',
        background_color: '#0a0e17',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cacheId: 'invest-brain-v2',
      },
    }),
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: 'https://invest-brain.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
});
