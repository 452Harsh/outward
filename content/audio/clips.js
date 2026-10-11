// Fixed narration clips (pre-recorded with ElevenLabs). Shared by the app,
// the generation script and the tests so clip text never drifts apart.

export const missionText = (chapter) => `${chapter.mission.prompt} ${chapter.mission.safetyNote}`;

export const clipId = (chapterId, part) => `${chapterId}-${part}`;

/** @returns {{id: string, title: string, text: string}[]} */
export function buildClips(story, note) {
  const clips = [{ id: 'safety-note', title: note.title, text: `${note.title}. ${note.points.join(' ')}` }];
  for (const ch of story.chapters) {
    const title = `Chapter ${ch.number}: ${ch.title}`;
    clips.push({ id: clipId(ch.id, 'intro'), title, text: ch.intro });
    clips.push({ id: clipId(ch.id, 'mission'), title, text: missionText(ch) });
    clips.push({ id: clipId(ch.id, 'cliffhanger'), title, text: ch.cliffhanger });
  }
  return clips;
}

/** Clips for a factory story pack (no safety-note clip; the app already has one). */
export function buildPackClips(pack) {
  return buildClips({ chapters: pack.chapters }, { title: '', points: [] }).filter((c) => c.id !== 'safety-note');
}

/** Credits per character by ElevenLabs model (multilingual v2 = 1, flash/turbo = 0.5). */
export function creditsPerChar(modelId) {
  return /flash|turbo/.test(modelId ?? '') ? 0.5 : 1;
}
