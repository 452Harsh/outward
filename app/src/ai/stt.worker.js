// Whisper tiny.en in a worker (Transformers.js, ONNX Runtime on WebAssembly).
// The runtime files are bundled with the app so speech works offline; the
// model files are cached by Transformers.js in Cache Storage.
import { env, pipeline } from '@huggingface/transformers';
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import registry from '@outward/content/models.json';

const speech = registry.speech;

env.allowLocalModels = false;
env.useBrowserCache = true;
// CPU build (14 MB) instead of the default WebGPU build from a CDN (27 MB).
env.backends.onnx.wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm };
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

// Some Transformers.js loaders ignore `revision` and ask for `resolve/main/`.
// Pin those to our revision and answer from the cache first, so speech keeps
// working offline and never mixes files from two revisions.
const baseFetch = env.fetch;
env.fetch = async (input, init) => {
  let url = typeof input === 'string' ? input : input.url;
  if (url.includes(`/${speech.repo}/resolve/`)) {
    url = url.replace(`/${speech.repo}/resolve/main/`, `/${speech.repo}/resolve/${speech.revision}/`);
    const hit = await caches.match(url);
    if (hit) return hit;
  }
  return baseFetch(url, init);
};

let asr = null;

function load(onProgress) {
  asr ??= pipeline('automatic-speech-recognition', speech.repo, {
    revision: speech.revision,
    dtype: speech.dtype,
    device: 'wasm',
    progress_callback: onProgress,
  }).catch((err) => {
    asr = null;
    throw err;
  });
  return asr;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      const perFile = {};
      await load((p) => {
        if (p.status !== 'progress' || !p.file) return;
        perFile[p.file] = p.loaded;
        const loaded = Object.values(perFile).reduce((a, b) => a + b, 0);
        self.postMessage({ id, type: 'progress', loaded });
      });
      self.postMessage({ id, type: 'done' });
    } else if (type === 'transcribe') {
      const t0 = performance.now();
      const run = await load();
      const out = await run(data.audio);
      self.postMessage({ id, type: 'done', text: (out.text ?? '').trim(), ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', error: String(err?.message ?? err) });
  }
};
