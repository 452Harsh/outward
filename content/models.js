import registry from './models.json' with { type: 'json' };

export { registry };

export function getModel(id = registry.default) {
  const m = registry.models[id];
  if (!m) throw new Error(`Unknown model: ${id}`);
  return { id, ...m };
}

export function hfUrl(m) {
  return `https://huggingface.co/${m.hf.repo}/resolve/${m.hf.revision}/${m.file}`;
}

/** Path under /models/ on Render (and under MODELS_DIR on the disk). */
export function renderPath(m) {
  return `${m.id}/${m.version}/${m.file}`;
}

/**
 * Download URLs in order of preference.
 * source "render": Render first, Hugging Face as fallback (demo build).
 * source "hf": Hugging Face only (development, and models not served from Render).
 */
export function modelUrls(m, source = 'hf', origin = '') {
  const urls = [];
  if (source === 'render' && m.serveFromRender) urls.push(`${origin}/models/${renderPath(m)}`);
  urls.push(hfUrl(m));
  return urls;
}
