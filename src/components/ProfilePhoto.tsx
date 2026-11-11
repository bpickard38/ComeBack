/**
 * Someone's profile photo in a circle, or an empty person outline until
 * they add one. Decorative: the name is always written next to it.
 */
export function ProfilePhoto({ url, size = 'lg' }: { url: string | null | undefined; size?: 'md' | 'lg' | 'xl' }) {
  if (url) return <img className={`avatar avatar--${size} avatar--photo`} src={url} alt="" />;
  return (
    <span className={`avatar avatar--${size} avatar--empty`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8.5" r="4" />
        <path d="M4 20.5c1.2-3.6 4.3-5.5 8-5.5s6.8 1.9 8 5.5" />
      </svg>
    </span>
  );
}
