// Serve the built studio and its real lip-sync handler together on loopback for QA.
import { Readable } from 'node:stream';
import { createServer, preview } from 'vite';

if (!process.env.RHUBARB_BINARY && !process.env.RHUBARB_WORKER_URL) {
  throw new Error('Set RHUBARB_BINARY or configure a local authenticated Rhubarb worker.');
}
if (process.env.RHUBARB_WORKER_URL && !['localhost', '127.0.0.1'].includes(new URL(process.env.RHUBARB_WORKER_URL).hostname)) {
  throw new Error('The QA worker must run on loopback.');
}
process.env.RHUBARB_GUEST_ENABLED = 'true';
const loader = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { default: gateway } = await loader.ssrLoadModule('/api/lipsync.ts');
const server = await preview({
  preview: { host: '127.0.0.1', port: Number(process.env.QA_PORT || 4173), strictPort: true },
  plugins: [{
    name: 'qa-lipsync',
    configurePreviewServer(server) {
      server.middlewares.use('/api/lipsync', async (req, res, next) => {
        try {
          const input = new Request('http://localhost/api/lipsync', {
            method: req.method, headers: req.headers,
            ...(req.method === 'POST' ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
          });
          const reply = await gateway.fetch(input);
          res.writeHead(reply.status, Object.fromEntries(reply.headers));
          res.end(Buffer.from(await reply.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  }],
});
server.printUrls();
async function stop() {
  await Promise.all([loader.close(), server.close()]);
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
