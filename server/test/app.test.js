import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.js';

const root = mkdtempSync(path.join(tmpdir(), 'outward-'));
const appDist = path.join(root, 'dist');
const modelsDir = path.join(root, 'models');
let app;

beforeAll(async () => {
  mkdirSync(path.join(appDist, 'assets'), { recursive: true });
  writeFileSync(path.join(appDist, 'index.html'), '<!doctype html><title>Outward</title>');
  writeFileSync(path.join(appDist, 'assets', 'main-abc123.js'), 'console.log(1)');
  app = buildServer({ appDist, modelsDir, logger: false });
  mkdirSync(path.join(modelsDir, 'test-model'), { recursive: true });
  writeFileSync(path.join(modelsDir, 'test-model', 'shard_0.bin'), Buffer.alloc(1024, 1));
  await app.ready();
});

afterAll(() => app.close());

describe('server', () => {
  it('reports health', async () => {
    const res = await app.inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, app: true });
  });

  it('serves the SPA for unknown pages, uncached', async () => {
    const res = await app.inject('/chapter/1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Outward</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('caches hashed assets forever', async () => {
    const res = await app.inject('/assets/main-abc123.js');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await app.inject('/api/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Not found' });
  });

  it('serves model shards with range support', async () => {
    const res = await app.inject({ url: '/models/test-model/shard_0.bin', headers: { range: 'bytes=0-99' } });
    expect(res.statusCode).toBe(206);
    expect(res.rawPayload.length).toBe(100);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('does not fall back to the SPA for missing model files', async () => {
    const res = await app.inject('/models/missing.bin');
    expect(res.statusCode).toBe(404);
  });
});
