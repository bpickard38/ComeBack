import { describe, expect, it } from 'vitest';
import { addSpokenText, audioFileName, loudness, pickAudioType } from './voice';

describe('pickAudioType', () => {
  it('prefers webm, and falls back to mp4 on Safari', () => {
    expect(pickAudioType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickAudioType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickAudioType(() => false)).toBeUndefined();
  });
});

describe('audioFileName', () => {
  it('matches the extension to the format', () => {
    expect(audioFileName('audio/webm;codecs=opus')).toBe('speech.webm');
    expect(audioFileName('audio/mp4')).toBe('speech.mp4');
    expect(audioFileName('audio/ogg;codecs=opus')).toBe('speech.ogg');
    expect(audioFileName('')).toBe('speech.webm');
  });
});

describe('addSpokenText', () => {
  it('fills an empty box with what you said', () => {
    expect(addSpokenText('', '  Give Maya an ankle plan. ')).toBe('Give Maya an ankle plan.');
  });

  it('adds to what was already typed', () => {
    expect(addSpokenText('Give Maya an ankle plan. ', 'Also add glute bridges.')).toBe('Give Maya an ankle plan. Also add glute bridges.');
  });

  it('leaves the box alone if nothing was heard', () => {
    expect(addSpokenText('typed', '   ')).toBe('typed');
  });
});

describe('loudness', () => {
  it('is 0 for silence and grows with volume', () => {
    expect(loudness([])).toBe(0);
    expect(loudness([0, 0, 0])).toBe(0);
    expect(loudness([0.5, -0.5])).toBeCloseTo(0.5);
  });
});
