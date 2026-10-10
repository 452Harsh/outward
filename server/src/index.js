import { buildServer } from './app.js';
import { syncModels } from './models.js';

const app = buildServer();
const port = Number(process.env.PORT ?? 10000);
const modelsDir = process.env.MODELS_DIR;

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Fill the Render disk in the background; /api/health reports progress.
if (modelsDir && process.env.SYNC_MODELS !== 'false') {
  syncModels(modelsDir, { log: app.log }).catch((err) => app.log.error(err));
}

const flush = setInterval(() => app.meter.flush(), 60_000);
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    clearInterval(flush);
    app.meter.flush();
    await app.close();
    process.exit(0);
  });
}
