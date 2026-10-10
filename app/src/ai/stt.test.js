import { describe, expect, it } from 'vitest';
import { cleanTranscript } from './stt.js';

describe('cleanTranscript', () => {
  it('drops Whisper noise markers', () => {
    expect(cleanTranscript(' [BLANK_AUDIO] a red  postbox (wind blowing) ')).toBe('a red postbox');
  });
  it('handles empty output', () => {
    expect(cleanTranscript(undefined)).toBe('');
  });
});
