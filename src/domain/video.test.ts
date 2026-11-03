import { describe, expect, it } from 'vitest';
import { youtubeEmbedUrl, youtubeId } from './video';

describe('tutorial video links', () => {
  it('reads the id from watch, short, embed and shorts links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=vHMJ0zgrsFU')).toBe('vHMJ0zgrsFU');
    expect(youtubeId('https://youtube.com/watch?v=vHMJ0zgrsFU&t=4s')).toBe('vHMJ0zgrsFU');
    expect(youtubeId('https://m.youtube.com/watch?v=vHMJ0zgrsFU')).toBe('vHMJ0zgrsFU');
    expect(youtubeId('https://youtu.be/_UvmPNGtlPM')).toBe('_UvmPNGtlPM');
    expect(youtubeId('https://www.youtube.com/embed/YKVi-BsdKw4')).toBe('YKVi-BsdKw4');
    expect(youtubeId('https://www.youtube.com/shorts/1CJ3hteGxo4')).toBe('1CJ3hteGxo4');
  });

  it('ignores links that are not YouTube videos', () => {
    expect(youtubeId('https://example.com/watch?v=vHMJ0zgrsFU')).toBeNull();
    expect(youtubeId('https://www.youtube.com/watch?v=bad')).toBeNull();
    expect(youtubeId('/videos/ankle.mp4')).toBeNull();
    expect(youtubeId('not a url')).toBeNull();
  });

  it('builds a privacy-enhanced embed link', () => {
    expect(youtubeEmbedUrl('https://youtu.be/vHMJ0zgrsFU')).toBe(
      'https://www.youtube-nocookie.com/embed/vHMJ0zgrsFU?rel=0&modestbranding=1',
    );
    expect(youtubeEmbedUrl('https://cdn.example.com/ankle.mp4')).toBeNull();
  });
});
