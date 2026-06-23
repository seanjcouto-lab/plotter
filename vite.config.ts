import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { parseSheetServer, type ParseRequest } from './api/_sheetParserCore';

// Dev-only middleware that mirrors the Vercel function at /api/parse-sheet
// so localhost:5173 has the same client API surface as production.
// Skips Supabase JWT verification in dev (zero attack surface on localhost).
function apiDevPlugin(apiKey: string | undefined): Plugin {
  return {
    name: 'plotter-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/parse-sheet', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', async () => {
          try {
            const body = JSON.parse(raw) as ParseRequest;
            if (!apiKey) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'No ANTHROPIC_API_KEY in .env.local' }));
              return;
            }
            const rows = await parseSheetServer(body, apiKey);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ rows }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load ALL env vars (including non-VITE_ prefixed) for use in plugins.
  // Client-side bundle still only gets VITE_ vars — that's the safety boundary.
  const env = loadEnv(mode, process.cwd(), '');
  const anthropicKey = env.ANTHROPIC_API_KEY;

  return {
  plugins: [
    react(),
    apiDevPlugin(anthropicKey),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Plotter',
        short_name: 'Plotter',
        description: 'Phone-first parts tracker',
        theme_color: '#0A1726',
        background_color: '#0A1726',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  };
});
