import { describe, expect, it } from 'vitest';
import { getModel, getModelOrDefault, hfUrl, modelUrls, registry, renderPath } from './models.js';

describe('model registry', () => {
  it.each(Object.keys(registry.models))('%s is pinned and complete', (id) => {
    const m = getModel(id);
    expect(m.hf.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(m.file).toMatch(/\.gguf$/);
    expect(m.bytes).toBeGreaterThan(1e8);
    expect(m.version).toContain(m.hf.revision.slice(0, 7));
  });

  it('keeps the default install under the size target', () => {
    expect(getModel().bytes).toBeLessThan(260e6);
  });

  it('puts the version in every URL so caches roll over on change', () => {
    const m = getModel();
    expect(renderPath(m)).toBe(`${m.id}/${m.version}/${m.file}`);
    expect(hfUrl(m)).toContain(`/resolve/${m.hf.revision}/`);
  });

  it('orders sources by build mode', () => {
    const m = getModel('outward-gemma3-270m');
    expect(modelUrls(m, 'render', 'https://x')).toEqual([`https://x/models/${renderPath(m)}`, hfUrl(m)]);
    expect(modelUrls(m, 'hf')).toEqual([hfUrl(m)]);
    expect(modelUrls(getModel('gemma3-1b'), 'render')).toEqual([hfUrl(getModel('gemma3-1b'))]);
  });
});

describe('model upgrades', () => {
  it('ships the distilled student as default, with the task prompt', () => {
    expect(getModel()).toMatchObject({ id: 'outward-gemma3-270m', promptStyle: 'task' });
  });
  it('falls back to the default for removed model ids (e.g. old stock 270M)', () => {
    expect(getModelOrDefault('gemma3-270m').id).toBe(registry.default);
  });
});
