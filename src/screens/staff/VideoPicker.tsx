import { useEffect, useRef, useState } from 'react';
import type { VideoOption } from '../../domain/assistant';
import { useAppStore } from '../../store/AppStore';

// Videos found per exercise name while the app is open, so a card that
// re-renders (or comes back) doesn't search again.
const foundVideos = new Map<string, Promise<{ ok: true; value: VideoOption[] } | { ok: false; error: string }>>();

/**
 * Tutorial videos for a new exercise. The search starts when the card
 * shows (it can take 20 to 40 seconds); on a card the first video is
 * picked for you, and you can switch or choose none.
 */
export function VideoPicker({
  exerciseName,
  chosen,
  onPick,
  pickFirst = true,
}: {
  exerciseName: string;
  /** The picked video's link, or null for none. */
  chosen: string | null;
  onPick: (video: VideoOption | null) => void;
  /** Pick the first video as soon as they arrive (on cards, so Confirm just works). */
  pickFirst?: boolean;
}) {
  const { commands } = useAppStore();
  const [videos, setVideos] = useState<VideoOption[] | null>(null);
  const [error, setError] = useState('');
  const picked = useRef(false);

  useEffect(() => {
    let live = true;
    const key = exerciseName.toLowerCase();
    if (!foundVideos.has(key)) foundVideos.set(key, commands.findVideos(exerciseName));
    foundVideos.get(key)!.then((result) => {
      if (!live) return;
      if (!result.ok) {
        foundVideos.delete(key); // try again next time
        setError(result.error);
        return;
      }
      setVideos(result.value);
      // Start with the first one so Confirm just works; the trainer can change it.
      if (pickFirst && !picked.current && !chosen && result.value[0]) onPick(result.value[0]);
      picked.current = true;
    });
    return () => {
      live = false;
    };
    // Only when the exercise changes; commands and onPick are new every render.
  }, [exerciseName]);

  if (error) return <span className="small muted assistant__detail">Couldn’t look for videos ({error}). It can be added later.</span>;
  if (videos === null) {
    return (
      <span className="small muted assistant__detail" role="status">
        Finding tutorial videos…
      </span>
    );
  }
  if (videos.length === 0) return <span className="small muted assistant__detail">No playable videos found. It will be added without one.</span>;

  return (
    <div className="video-picks" role="radiogroup" aria-label={`Tutorial video for ${exerciseName}`}>
      {videos.map((v, i) => (
        <label key={v.url} className="video-pick" data-picked={chosen === v.url || undefined}>
          <input type="radio" name={`video-${exerciseName}`} className="visually-hidden" checked={chosen === v.url} onChange={() => onPick(v)} />
          <span className="video-pick__thumb">
            {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" /> : null}
            <span className="video-pick__num" aria-hidden="true">
              {i + 1}
            </span>
          </span>
          <span className="video-pick__title">{v.title}</span>
          <span className="small muted">{v.channel}</span>
          <a href={v.url} target="_blank" rel="noreferrer" className="link-button small" onClick={(e) => e.stopPropagation()}>
            Watch<span className="visually-hidden"> {v.title} on YouTube (new tab)</span>
          </a>
        </label>
      ))}
      <label className="video-pick video-pick--none" data-picked={chosen === null || undefined}>
        <input type="radio" name={`video-${exerciseName}`} className="visually-hidden" checked={chosen === null} onChange={() => onPick(null)} />
        <span className="small">No video</span>
      </label>
    </div>
  );
}
