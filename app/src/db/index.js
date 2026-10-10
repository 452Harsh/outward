import { openDB } from 'idb';
import { newProgress } from '../engine/story.js';

let dbPromise;

function db() {
  dbPromise ??= openDB('outward', 1, {
    upgrade(d) {
      d.createObjectStore('meta');
      d.createObjectStore('progress', { keyPath: 'storyId' });
      const sessions = d.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
      sessions.createIndex('byStory', 'storyId');
    },
  });
  return dbPromise;
}

export async function getMeta(key, fallback) {
  return (await (await db()).get('meta', key)) ?? fallback;
}

export async function setMeta(key, value) {
  await (await db()).put('meta', value, key);
}

export async function getProgress(storyId) {
  return (await (await db()).get('progress', storyId)) ?? newProgress(storyId);
}

export async function saveProgress(progress) {
  await (await db()).put('progress', progress);
}

/** @param {{storyId: string, chapterId: string, startedAt: number, endedAt: number, timeBudget: number, discovery: string, continuationSource: string}} session */
export async function addSession(session) {
  return (await db()).add('sessions', session);
}

export async function resetStory(storyId) {
  const d = await db();
  const tx = d.transaction(['progress', 'sessions'], 'readwrite');
  await tx.objectStore('progress').delete(storyId);
  const idx = tx.objectStore('sessions').index('byStory');
  for await (const cursor of idx.iterate(storyId)) await cursor.delete();
  await tx.done;
}
