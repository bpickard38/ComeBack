import type { Metal } from '../domain/rank';

/** Trophy drawing. Decorative, so screen readers skip it. */
export function TrophyIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4" />
      <path d="M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4" />
      <path d="M8 20h8" />
      <path d="M10 17h4" />
    </svg>
  );
}

/** Trophy in a metal-colored circle. `metal` null means locked (grey-blue). */
export function Medal({ metal, large = false }: { metal: Metal | null; large?: boolean }) {
  const tone = metal ? metal.toLowerCase() : 'locked';
  return (
    <div className={`medal medal--${tone}${large ? ' medal--lg' : ''}`}>
      <TrophyIcon size={large ? 40 : 26} />
    </div>
  );
}
