import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer, mergeConfig } from 'vite';
import baseConfig from '../vite.config.js';
import { localRanker } from '../shared/recommendation-learning.mjs';

// An isolated loopback origin, never a published entry point. Synthetic events
// are retained as synthetic on export and cannot replace the ordinary origin.
const port = 4185;
const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = JSON.parse(await readFile(new URL('../.build/recommendation-training/2026-10-09/inference-replays.json', import.meta.url), 'utf8'));
const fixture = fixtures.find(f => f.persona === (process.argv[2] ?? 'nearby_first'));
if (!fixture || fixture.provenance !== 'synthetic-test') throw Error('Run the synthetic training first; a validated replay is required.');
const history = { ...fixture.personal.history, preferenceSetup: 'complete', rankingProvenance: 'synthetic-test' };
if (!localRanker(history, 'short_term')) throw Error('This sample no longer passes local validation. Re-run training before previewing.');
const request = { ...fixture.response.request, pickup: { ...fixture.response.request.pickup, label: 'Selected starting point' } };
const seed = { history, library: fixture.personal.library, request };
const entry = '/__local-training-preview.js';
const marker = `equalpath:local-preview:20261009:${fixture.persona}`;
const bootstrap = `
const seed = ${JSON.stringify(seed)};
if (location.hostname !== '127.0.0.1' || location.port !== '${port}') throw Error('Local preview only');
if (!localStorage.getItem(${JSON.stringify(marker)})) {
  if (localStorage.getItem('equalpath:interests:v1:live') || localStorage.getItem('equalpath:saved:v1:live')) {
    throw Error('Preview origin already has data; nothing was overwritten.');
  }
  localStorage.setItem('equalpath:interests:v1:live', JSON.stringify(seed.history));
  localStorage.setItem('equalpath:saved:v1:live', JSON.stringify(seed.library));
  localStorage.setItem('equalpath:map:v1:live', JSON.stringify({version:1, center:seed.request.pickup, zoom:12.5, pickup:seed.request.pickup}));
  localStorage.setItem('equalpath:tour:v1', JSON.stringify({version:1, status:'skipped'}));
  localStorage.setItem(${JSON.stringify(marker)}, '1');
}
globalThis.__EQUALPATH_PREVIEW_REQUEST__ = seed.request;
await import('/src/main.jsx');
`;
const previewPlugin = {
  name: 'local-trained-ranking-preview',
  transformIndexHtml: { order: 'pre', handler: html => html.replace('src="/src/main.jsx"', `src="${entry}"`) },
  configureServer(server) {
    server.middlewares.use(entry, (_req, res) => {
      res.setHeader('Content-Type', 'text/javascript'); res.setHeader('Cache-Control', 'no-store'); res.end(bootstrap);
    });
  },
};
const server = await createServer(mergeConfig(baseConfig, {
  configFile: false, root, plugins: [previewPlugin],
  define: { 'import.meta.env.VITE_EQUALPATH_API_URL': JSON.stringify('/api') },
  server: { host: '127.0.0.1', port, strictPort: true },
}));
await server.listen();
console.log(`Local trained preview: http://127.0.0.1:${port}/#discover`);
console.log('Synthetic browser profile on a separate origin; normal website UI, no production changes.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
