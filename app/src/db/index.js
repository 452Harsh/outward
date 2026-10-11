import { openDB } from 'idb';
import { newProgress } from '../engine/story.js';

let dbPromise;

function db() {
  dbPromise ??= openDB('outward', 4, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('meta');
        d.createObjectStore('progress', { keyPath: 'storyId' });
        const sessions = d.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        sessions.createIndex('byStory', 'storyId');
      }
      if (oldVersion < 2) {
        // Field-test event log (screen-off experiments). Cleared per run.
        d.createObjectStore('fieldlog', { keyPath: 'id', autoIncrement: true });
      }
      if (oldVersion < 3) {
        // Story packs downloaded from the story factory (text; audio lives in Cache Storage).
        d.createObjectStore('packs', { keyPath: 'id' });
      }
      if (oldVersion < 4) {
        // Optional journal photos (compressed JPEG blobs, never sent anywhere).
        d.createObjectStore('photos');
      }
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

/** @param {{storyId: string, chapterId: string, startedAt: number, endedAt: number, timeBudget: number, discovery: string, continuationSource: string, meters: number}} session */
export async function addSession(session) {
  return (await db()).add('sessions', session);
}

/**
 * The chapter in progress, saved after every step so nothing is lost if
 * Chrome kills the page while the phone is in a pocket.
 */
export const getActiveChapter = () => getMeta('activeChapter', null);
export const saveActiveChapter = (state) => setMeta('activeChapter', state);
export const clearActiveChapter = () => setMeta('activeChapter', null);

export async function getPacks() {
  return (await db()).getAll('packs');
}

export async function savePack(pack) {
  await (await db()).put('packs', pack);
}

export async function updateSession(id, patch) {
  const d = await db();
  const s = await d.get('sessions', id);
  if (s) await d.put('sessions', { ...s, ...patch });
}

export async function getPhoto(sessionId) {
  return (await db()).get('photos', sessionId);
}

export async function savePhoto(sessionId, blob) {
  await (await db()).put('photos', blob, sessionId);
}

export async function getSessions() {
  return (await db()).getAll('sessions');
}

export async function resetStory(storyId) {
  const d = await db();
  const tx = d.transaction(['progress', 'sessions', 'meta'], 'readwrite');
  await tx.objectStore('progress').delete(storyId);
  await tx.objectStore('meta').delete('activeChapter');
  const idx = tx.objectStore('sessions').index('byStory');
  for await (const cursor of idx.iterate(storyId)) await cursor.delete();
  await tx.done;
}

export async function logField(type, data = {}) {
  await (await db()).add('fieldlog', { t: Date.now(), type, hidden: document.visibilityState === 'hidden', ...data });
}

export async function getFieldLog() {
  return (await db()).getAll('fieldlog');
}

export async function clearFieldLog() {
  await (await db()).clear('fieldlog');
}
