import { buildServer } from './app.js';

const app = buildServer();
const port = Number(process.env.PORT ?? 10000);

try {
  await app.listen({ port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
