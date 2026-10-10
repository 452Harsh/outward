import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createBandwidthMeter } from './bandwidth.js';
import { fallbackUrlFor, modelStatus } from './models.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Files that must always be revalidated so app updates reach phones.
const NO_CACHE = new Set(['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);

export function buildServer({
  appDist = process.env.APP_DIST ?? path.resolve(here, '../../app/dist'),
  modelsDir = process.env.MODELS_DIR ?? path.resolve(here, '../../.models'),
  budgetGB = Number(process.env.MODEL_BANDWIDTH_BUDGET_GB ?? 60),
  logger = true,
} = {}) {
  const app = Fastify({ logger });
  const hasApp = existsSync(appDist);
  mkdirSync(modelsDir, { recursive: true });
  const meter = createBandwidthMeter({ file: path.join(path.dirname(modelsDir), 'bandwidth.json'), budgetGB });
  app.decorate('meter', meter);

  // Cross-origin isolation for multi-threaded on-device inference (SharedArrayBuffer).
  app.addHook('onSend', async (req, reply) => {
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
  });

  app.get('/api/health', async () => ({
    ok: true,
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
    app: hasApp,
    models: modelStatus(modelsDir),
    bandwidth: meter.snapshot(),
  }));

  // Model weights on the Render disk. Once the monthly bandwidth budget is
  // used up, requests are redirected to the same file on Hugging Face.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/models/') || !meter.overBudget()) return;
    const target = fallbackUrlFor(decodeURIComponent(req.url.slice('/models/'.length).split('?')[0]));
    if (target) return reply.redirect(target, 302);
  });
  app.addHook('onResponse', async (req, reply) => {
    if (!req.url.startsWith('/models/') || (reply.statusCode !== 200 && reply.statusCode !== 206)) return;
    meter.add(Number(reply.getHeader('content-length') ?? 0));
  });

  app.register(fastifyStatic, {
    root: modelsDir,
    prefix: '/models/',
    decorateReply: false,
    cacheControl: false,
    setHeaders(reply) {
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  if (hasApp) {
    app.register(fastifyStatic, {
      root: appDist,
      prefix: '/',
      cacheControl: false,
      setHeaders(reply, filePath) {
        const name = path.basename(filePath);
        if (NO_CACHE.has(name) || name.startsWith('workbox-')) {
          reply.header('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          reply.header('Cache-Control', 'public, max-age=3600');
        }
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    const isPage = req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/models/');
    if (isPage && hasApp) return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
