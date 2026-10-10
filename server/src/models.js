// Keeps the Render disk in sync with content/models.json: downloads the
// current version of every Render-served model from Hugging Face (inbound
// traffic is free) and deletes old versions so the 1 GB disk never fills up.
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getModel, hfUrl, registry, renderPath } from '@outward/content/models';

export const renderModels = () =>
  Object.keys(registry.models)
    .map((id) => getModel(id))
    .filter((m) => m.serveFromRender);

/** Map a /models/<id>/<version>/<file> path to its Hugging Face URL, or null. */
export function fallbackUrlFor(relPath) {
  const m = renderModels().find((x) => renderPath(x) === relPath);
  return m ? hfUrl(m) : null;
}

export function modelStatus(modelsDir) {
  return renderModels().map((m) => {
    const file = path.join(modelsDir, renderPath(m));
    const size = existsSync(file) ? statSync(file).size : 0;
    return { id: m.id, version: m.version, ready: size === m.bytes };
  });
}

export async function syncModels(modelsDir, { log = console, fetchImpl = fetch } = {}) {
  const keep = new Set();
  for (const m of renderModels()) {
    const rel = renderPath(m);
    keep.add(path.dirname(rel));
    const dest = path.join(modelsDir, rel);
    if (existsSync(dest) && statSync(dest).size === m.bytes) continue;

    mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    log.info?.(`models: downloading ${m.id} ${m.version}`);
    const res = await fetchImpl(hfUrl(m));
    if (!res.ok) throw new Error(`models: ${m.id} download failed (${res.status})`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    if (statSync(tmp).size !== m.bytes) {
      rmSync(tmp, { force: true });
      throw new Error(`models: ${m.id} size mismatch`);
    }
    renameSync(tmp, dest);
    log.info?.(`models: ${m.id} ready`);
  }

  // Remove versions that are no longer in the registry.
  for (const id of existsSync(modelsDir) ? readdirSync(modelsDir) : []) {
    const dir = path.join(modelsDir, id);
    if (!statSync(dir).isDirectory()) continue;
    for (const version of readdirSync(dir)) {
      if (!keep.has(`${id}/${version}`)) rmSync(path.join(dir, version), { recursive: true, force: true });
    }
  }
}
