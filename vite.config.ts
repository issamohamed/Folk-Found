import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The dataset, at the project root and the single source of truth. */
const DATA_FILES = ['entities.json'] as const;

/**
 * Rather than keeping a second copy under public/ that could drift, this plugin
 * serves the canonical file in dev and emits it into the build.
 */
function datasetAssets(): Plugin {
  const pathFor = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

  return {
    name: 'folk-and-found:dataset-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requested = req.url?.split('?')[0]?.replace(/^\//, '');
        if (!requested || !DATA_FILES.includes(requested as (typeof DATA_FILES)[number])) {
          return next();
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(readFileSync(pathFor(requested)));
      });
    },
    generateBundle() {
      for (const name of DATA_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: name,
          source: readFileSync(pathFor(name), 'utf8'),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), datasetAssets()],
  server: {
    // Vite does not read PORT by itself. Honouring it lets a harness assign a
    // free port instead of colliding on 5173; nothing here needs a fixed port,
    // since the only cross-origin traffic is outbound to the Worker below.
    port: Number(process.env.PORT) || 5173,
    // /api/* is served by the real Pages Functions runtime (`npm run dev:api`),
    // so local development exercises the actual Worker and its KV rather than a
    // mock. Vite keeps serving the app with HMR.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
});
