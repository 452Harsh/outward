import { openDB } from 'idb';
import { newProgress } from '../engine/story.js';

let dbPromise;

function db() {
  dbPromise ??= openDB('outward', 2, {
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
