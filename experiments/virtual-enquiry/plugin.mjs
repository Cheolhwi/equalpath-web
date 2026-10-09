import { createSearchStore } from '../../server/search-catalog.mjs';
import { virtualBranches } from './model.mjs';
import { createEnquiryService } from './service.mjs';
import { telegramTransport } from './telegram.mjs';

export function virtualEnquiryPlugin() {
  return { name: 'equalpath-virtual-enquiry', apply: 'serve',
    async configureServer(server) {
      if (process.env.VITE_VIRTUAL_ENQUIRY !== '1') return;
      const catalogue = await createSearchStore().catalog('short_term');
      const transport = telegramTransport();
      const service = createEnquiryService({ branches: virtualBranches(catalogue.items), transport });
      if (transport) await transport.start(service.reply);
      server.httpServer?.once('close', () => service.close());
      server.middlewares.use('/virtual-enquiry-api', async (req, res) => {
        res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        try {
          // Bound to loopback, reject DNS rebinding and cross-origin browser writes.
          const host = req.headers.host ?? '';
          if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || (req.headers.origin && req.headers.origin !== `http://${host}`)) { res.statusCode = 403; res.end('{"error":"Local test only."}'); return; }
          if (req.method === 'GET' && req.url === '/config') { res.end(JSON.stringify(service.config())); return; }
          if (req.method !== 'POST' || req.headers['x-equalpath-sandbox'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) { res.statusCode = 405; res.end('{"error":"Use the local test form."}'); return; }
          let raw = '';
          for await (const chunk of req) { raw += chunk; if (raw.length > 6000) { res.statusCode = 413; res.end('{"error":"Test request too large."}'); return; } }
          const token = req.headers.authorization?.replace(/^Bearer /, '');
          const body = JSON.parse(raw);
          if (body.action === 'watch') {
            // Authenticated response stream, no token in URLs and no polling reads.
            // Validate ownership before starting a successful response.
            await service.handle(token, { action: 'get', id: body.id });
            res.setHeader('Content-Type', 'application/x-ndjson');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();
            let unsubscribe = () => {};
            const heartbeat = setInterval(() => { if (!res.destroyed) res.write('\n'); }, 15000);
            const cleanup = () => { clearInterval(heartbeat); unsubscribe(); };
            res.once('close', cleanup);
            unsubscribe = service.subscribe(token, body.id, job => {
              if (res.destroyed || res.writableEnded) return;
              res.write(JSON.stringify({ job }) + '\n');
              if (!['queued', 'waiting'].includes(job.state)) res.end();
            });
            if (res.writableEnded) cleanup();
            return;
          }
          const value = await service.handle(token, body);
          res.end(JSON.stringify(value));
        } catch (e) { res.statusCode = e.status || 400; res.end(JSON.stringify({ error: e.status ? e.message : 'The test request could not be processed.' })); }
      });
    },
  };
}
