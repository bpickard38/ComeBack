/*
  Tutorial videos are YouTube links stored in exercises.video_url.
  A plain watch link can't play inside the app, so it's turned into an
  embed link. youtube-nocookie.com is YouTube's privacy-enhanced player:
  no tracking cookies until the athlete presses play.
*/

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id from any common YouTube link, or null. */
export function youtubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1);
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
    else {
      const match = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
      id = match ? match[1] : null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Embed link for an iframe, or null if the link isn't YouTube. */
export function youtubeEmbedUrl(url: string): string | null {
  const id = youtubeId(url);
  // rel=0: suggested videos at the end come from the same channel only.
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` : null;
}
