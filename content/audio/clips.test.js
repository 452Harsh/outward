import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import story from '../stories/quiet-atlas/story.json' with { type: 'json' };
import note from '../safety/note.json' with { type: 'json' };
import manifest from './manifest.json' with { type: 'json' };
import { checkText } from '../safety/filter.js';
import { buildClips, clipId, creditsPerChar } from './clips.js';

const clips = buildClips(story, note);

describe('narration clips', () => {
  it('has the safety note plus intro, mission and cliffhanger per chapter', () => {
    expect(clips).toHaveLength(1 + story.chapters.length * 3);
    for (const ch of story.chapters) {
      for (const part of ['intro', 'mission', 'cliffhanger']) expect(clips.some((c) => c.id === clipId(ch.id, part))).toBe(true);
    }
    expect(new Set(clips.map((c) => c.id)).size).toBe(clips.length);
  });

  it('only narrates safe text', () => {
    for (const c of clips.filter((x) => x.id !== 'safety-note')) expect(checkText(c.text).violations, c.id).toEqual([]);
  });

  it('every manifest entry is a known clip with its file on disk', () => {
    const ids = new Set(clips.map((c) => c.id));
    for (const [id, c] of Object.entries(manifest.clips)) {
      expect(ids.has(id), id).toBe(true);
      expect(existsSync(path.resolve(import.meta.dirname, '../../app/public/audio', c.file)), c.file).toBe(true);
    }
  });

  it('prices flash/turbo at half a credit per character', () => {
    expect(creditsPerChar('eleven_multilingual_v2')).toBe(1);
    expect(creditsPerChar('eleven_flash_v2_5')).toBe(0.5);
  });
});
