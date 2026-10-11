// Stories on this phone: the bundled season plus packs from the story factory.
import { getMeta, getPacks, getProgress, savePack, setMeta } from '../db/index.js';
import { bundledAudio } from '../audio/narrator.js';
import { getStory } from './story.js';

export const PACK_CACHE = 'outward-packs';

export function bundledStory() {
  return { ...getStory(), audio: bundledAudio };
}

export async function installedStories() {
  return [bundledStory(), ...(await getPacks())];
}

/** Packs the server offers. Falls back to the last list seen when offline. */
export async function fetchPackIndex() {
  try {
    const res = await fetch('/api/packs', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const index = await res.json();
    await setMeta('packIndex', index);
    return index;
  } catch {
    return getMeta('packIndex', []);
  }
}

/** Download a pack's text and narration. It only appears once everything is saved. */
export async function downloadPack(id, { onProgress } = {}) {
  const res = await fetch(`/api/packs/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Pack unavailable (${res.status})`);
  const pack = await res.json();
  const clips = Object.values(pack.audio?.clips ?? {});
  const total = clips.reduce((n, c) => n + (c.bytes ?? 0), 0);
  const cache = await caches.open(PACK_CACHE);
  let done = 0;
  for (const c of clips) {
    const url = `${pack.audio.base}${c.file}`;
    if (!(await cache.match(url))) {
      const audio = await fetch(url);
      if (!audio.ok) throw new Error(`Audio download failed (${audio.status})`);
      await cache.put(url, audio);
    }
    done += c.bytes ?? 0;
    onProgress?.(done, total);
  }
  // Remove narration from an older version of this pack.
  const keep = new Set(clips.map((c) => `${pack.audio.base}${c.file}`));
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith(pack.audio.base) && !keep.has(path)) await cache.delete(req);
  }
  await savePack(pack);
  return pack;
}

/** A pack can require another story to be finished first. */
export async function lockedBy(story, stories) {
  if (!story.requires) return null;
  const req = stories.find((s) => s.id === story.requires);
  if (!req) return null;
  const p = await getProgress(req.id);
  return p.completed.length >= req.chapters.length ? null : req;
}
