import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getModel, hfUrl, renderPath } from '@outward/content/models';
import { buildServer } from '../src/app.js';
import { modelStatus, syncModels } from '../src/models.js';

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

describe('cross-origin isolation', () => {
  it('sets COOP/COEP on every response', async () => {
    const res = await app.inject('/api/health');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');
  });
});

describe('model bandwidth guardrail', () => {
  it('counts bytes served from /models', async () => {
    const before = app.meter.snapshot().gb;
    app.meter.add(2e9);
    expect(app.meter.snapshot().gb).toBeCloseTo(before + 2, 1);
  });

  it('redirects known model files to Hugging Face once over budget', async () => {
    const over = buildServer({ appDist, modelsDir: path.join(root, 'models2'), budgetGB: 0.000001, logger: false });
    await over.ready();
    over.meter.add(10_000);
    const m = getModel('outward-gemma3-270m');
    const res = await over.inject(`/models/${renderPath(m)}`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(hfUrl(m));
    const unknown = await over.inject('/models/other/file.gguf');
    expect(unknown.statusCode).toBe(404);
    await over.close();
  });
});

describe('model sync', () => {
  it('downloads Render-served models, verifies size, prunes old versions', async () => {
    const dir = path.join(root, 'sync');
    const m = getModel('outward-gemma3-270m');
    mkdirSync(path.join(dir, m.id, 'old-version'), { recursive: true });
    const fetchImpl = async () => new Response(new Uint8Array(m.bytes));
    await syncModels(dir, { log: {}, fetchImpl });
    expect(modelStatus(dir)).toEqual([{ id: m.id, version: m.version, ready: true }]);
    expect(existsSync(path.join(dir, m.id, 'old-version'))).toBe(false);
  });

  it('rejects a truncated download', async () => {
    const dir = path.join(root, 'sync-bad');
    const fetchImpl = async () => new Response(new Uint8Array(10));
    await expect(syncModels(dir, { log: {}, fetchImpl })).rejects.toThrow('size mismatch');
  });
});

describe('story packs', () => {
  const packsDir = path.join(root, 'packs');
  const mk = (id, status, extra = {}) => {
    mkdirSync(path.join(packsDir, id, 'audio'), { recursive: true });
    const pack = { id, version: 1, status, title: `T ${id}`, tagline: 't', requires: 'quiet-atlas', chapters: [{ id: 'c1' }],
      audio: { base: `/packs/${id}/audio/`, clips: { 'c1-intro': { file: 'c1-intro-abc.mp3', bytes: 10 } } }, ...extra };
    writeFileSync(path.join(packsDir, id, 'pack.json'), JSON.stringify(pack));
    writeFileSync(path.join(packsDir, id, 'audio', 'c1-intro-abc.mp3'), Buffer.alloc(10));
  };
  let srv;
  beforeAll(async () => {
    mk('second-atlas', 'approved');
    mk('draft-pack', 'draft');
    srv = buildServer({ appDist, modelsDir: path.join(root, 'models3'), packsDir, logger: false });
    await srv.ready();
  });
  afterAll(() => srv.close());

  it('lists only approved packs', async () => {
    const res = await srv.inject('/api/packs');
    expect(res.json().map((p) => p.id)).toEqual(['second-atlas']);
    expect(res.json()[0]).toMatchObject({ chapters: 1, requires: 'quiet-atlas' });
  });
  it('serves an approved pack and 404s drafts', async () => {
    expect((await srv.inject('/api/packs/second-atlas')).json().title).toBe('T second-atlas');
    expect((await srv.inject('/api/packs/draft-pack')).statusCode).toBe(404);
  });
  it('serves approved pack audio only', async () => {
    const ok = await srv.inject('/packs/second-atlas/audio/c1-intro-abc.mp3');
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toContain('immutable');
    expect((await srv.inject('/packs/draft-pack/audio/c1-intro-abc.mp3')).statusCode).toBe(404);
    expect((await srv.inject('/packs/second-atlas/pack.json')).statusCode).toBe(404);
  });
});
