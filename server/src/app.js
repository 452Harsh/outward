import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

const here = path.dirname(fileURLToPath(import.meta.url));

// Files that must always be revalidated so app updates reach phones.
const NO_CACHE = new Set(['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);

export function buildServer({
  appDist = process.env.APP_DIST ?? path.resolve(here, '../../app/dist'),
  modelsDir = process.env.MODELS_DIR ?? path.resolve(here, '../../.models'),
  logger = true,
} = {}) {
  const app = Fastify({ logger });
  const hasApp = existsSync(appDist);
  mkdirSync(modelsDir, { recursive: true });

  app.get('/api/health', async () => ({
    ok: true,
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
    app: hasApp,
  }));

  // Model weights live on the Render persistent disk (phase 2). Range requests
  // are supported so interrupted downloads can resume.
  app.register(fastifyStatic, {
    root: modelsDir,
    prefix: '/models/',
    decorateReply: false,
    cacheControl: false,
    setHeaders(reply) {
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('Access-Control-Allow-Origin', '*');
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
