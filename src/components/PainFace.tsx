/*
  A simple face for a pain number, like the faces on a pain scale chart:
  a big smile at 0 that flattens out and turns into a frown by 10, in the
  same green-to-red color as the number buttons. Decorative only; the
  number and its words carry the meaning.
*/
import { painColor } from '../domain/pain';

export function PainFace({ pain, size = 40 }: { pain: number; size?: number }) {
  // How far the middle of the mouth bends: +4 (smile) at 0, -4 (frown) at 10.
  const bend = 4 - (8 * pain) / 10;
  // From 7 up the eyebrows slant in, like the chart's worried faces.
  const worried = pain >= 7;
  return (
    <svg className="pain-face" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={painColor(pain)} />
      <circle cx="8.5" cy="10" r="1.3" fill="#1b1b1f" />
      <circle cx="15.5" cy="10" r="1.3" fill="#1b1b1f" />
      {worried && <path d="M6.5 7.2 L10 6.2 M17.5 7.2 L14 6.2" stroke="#1b1b1f" strokeWidth="1.2" strokeLinecap="round" />}
      <path
        d={`M7.5 16 Q12 ${16 + bend} 16.5 16`}
        fill="none"
        stroke="#1b1b1f"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
