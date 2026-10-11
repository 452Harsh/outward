// Story packs made by the factory (server/factory, run on a Mac) and served
// here. Only packs marked "approved" after review are listed or served.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export function loadPacks(packsDir) {
  if (!existsSync(packsDir)) return new Map();
  const packs = new Map();
  for (const id of readdirSync(packsDir)) {
    const file = path.join(packsDir, id, 'pack.json');
    if (!existsSync(file)) continue;
    const pack = JSON.parse(readFileSync(file, 'utf8'));
    if (pack.status !== 'approved' || pack.id !== id) continue;
    const audioBytes = Object.values(pack.audio?.clips ?? {}).reduce((n, c) => n + (c.bytes ?? 0), 0);
    packs.set(id, { pack, bytes: statSync(file).size + audioBytes });
  }
  return packs;
}

export function packIndex(packs) {
  return [...packs.values()].map(({ pack, bytes }) => ({
    id: pack.id,
    version: pack.version,
    title: pack.title,
    tagline: pack.tagline,
    chapters: pack.chapters.length,
    requires: pack.requires ?? null,
    bytes,
  }));
}
