// On-device storyteller runtime: llama.cpp (wllama) with WebGPU when available,
// multi-threaded CPU otherwise. One model is installed per phone.
import { getModel, getModelOrDefault, modelUrls } from '@outward/content/models';
import { getMeta, setMeta } from '../db/index.js';
import { detectWebGPU } from '../lib/device.js';

export const MODEL_SOURCE = import.meta.env.VITE_MODEL_SOURCE === 'render' ? 'render' : 'hf';

let wllamaPromise = null;
let loaded = null;
let loading = null;

async function getWllama() {
  wllamaPromise ??= (async () => {
    const [{ Wllama, LoggerWithoutDebug }, { default: wasmUrl }] = await Promise.all([
      import('@wllama/wllama'),
      import('@wllama/wllama/esm/wasm/wllama.wasm?url'),
    ]);
    return new Wllama(
      { default: wasmUrl },
      { allowOffline: true, logger: LoggerWithoutDebug, suppressNativeLog: true },
    );
  })();
  return wllamaPromise;
}

/** The model the user picked in settings (not necessarily downloaded yet). */
export async function getChosenModel() {
  return getModelOrDefault(await getMeta('modelChoice', null));
}

/** Prompt style for the model that is actually installed (old phones may still have a stock model). */
export async function installedPromptStyle() {
  const rec = await getInstalled();
  if (!rec) return null;
  try {
    return getModel(rec.id).promptStyle;
  } catch {
    return 'fewshot'; // a stock model that has since been removed from the registry
  }
}

/** True when a newer storyteller than the installed one is available. */
export async function updateAvailable() {
  const [rec, chosen] = await Promise.all([getInstalled(), getChosenModel()]);
  return Boolean(rec) && (rec.id !== chosen.id || rec.version !== chosen.version) ? chosen : null;
}

export async function setChosenModel(id) {
  await setMeta('modelChoice', getModel(id).id);
}

/** Record of the model that is downloaded on this phone, or null. */
export async function getInstalled() {
  return getMeta('model', null);
}

/** True when `m` (current version) is fully downloaded and valid in the cache. */
export async function isInstalled(m) {
  const rec = await getInstalled();
  if (!rec || rec.id !== m.id || rec.version !== m.version) return false;
  const w = await getWllama();
  const cached = await w.modelManager.getModels();
  return cached.some((x) => x.url === rec.url && x.validate() === 'valid');
}

/**
 * Download a model, trying each source in order (Render, then Hugging Face in
 * the demo build). On success every other cached model is deleted.
 */
export async function downloadModel(id, { onProgress, signal } = {}) {
  const m = getModel(id);
  const w = await getWllama();
  let lastError;
  for (const url of modelUrls(m, MODEL_SOURCE, location.origin)) {
    try {
      await w.modelManager.downloadModel(url, {
        signal,
        progressCallback: ({ loaded: done, total }) => onProgress?.(done, total || m.bytes),
      });
      await unload();
      const fresh = await getWllama();
      for (const x of await fresh.modelManager.getModels({ includeInvalid: true })) {
        if (x.url !== url) await x.remove();
      }
      const rec = { id: m.id, version: m.version, url, bytes: m.bytes, installedAt: Date.now() };
      await setMeta('model', rec);
      return rec;
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError ?? new Error('Download failed');
}

export async function removeAllModels() {
  await unload();
  const w = await getWllama();
  await w.modelManager.clear();
  await setMeta('model', null);
}

/**
 * Load the installed model into memory. Call this while the screen is on
 * (e.g. when a chapter starts) so generation later is instant.
 * @param {{gpu?: boolean}} [opts] force GPU or CPU; defaults to GPU when WebGPU works.
 */
export async function loadModel({ gpu } = {}) {
  const rec = await getInstalled();
  if (!rec) throw new Error('No model installed');
  const useGpu = gpu ?? (await detectWebGPU()).supported;
  if (loaded && loaded.url === rec.url && loaded.gpu === useGpu) return loaded;
  if (loading) return loading;

  loading = (async () => {
    if (loaded) await unload();
    const w = await getWllama();
    const m = getModelOrDefault(rec.id);
    const t0 = performance.now();
    await w.loadModelFromUrl(rec.url, { n_ctx: m.nCtx, n_gpu_layers: useGpu ? 999 : 0 });
    loaded = {
      id: m.id,
      url: rec.url,
      gpu: useGpu,
      loadMs: Math.round(performance.now() - t0),
      threads: w.getNumThreads(),
      multithread: w.isMultithread(),
    };
    return loaded;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export async function unload() {
  if (!wllamaPromise) return;
  const w = await wllamaPromise;
  if (w.isModelLoaded()) await w.exit();
  wllamaPromise = null;
  loaded = null;
}

export function getLoadedInfo() {
  return loaded;
}

/**
 * @returns {Promise<{text: string, ms: number, promptTokens: number, tokens: number, tokensPerSec: number, promptPerSec: number, gpu: boolean}>}
 */
export async function generate(messages, { maxTokens = 160, signal } = {}) {
  const info = await loadModel();
  const w = await getWllama();
  const t0 = performance.now();
  let text = '';
  let timings = null;
  await w.createChatCompletion({
    messages,
    max_tokens: maxTokens,
    temperature: 0.8,
    top_k: 64,
    top_p: 0.95,
    penalty_repeat: 1.1,
    abortSignal: signal,
    stream: true,
    onData: (chunk) => {
      text += chunk.choices[0]?.delta?.content ?? '';
      if (chunk.timings) timings = chunk.timings;
    },
  });
  return {
    text,
    ms: Math.round(performance.now() - t0),
    promptTokens: timings?.prompt_n ?? 0,
    tokens: timings?.predicted_n ?? 0,
    tokensPerSec: round1(timings?.predicted_per_second),
    promptPerSec: round1(timings?.prompt_per_second),
    gpu: info.gpu,
  };
}

const round1 = (n) => Math.round((n ?? 0) * 10) / 10;
