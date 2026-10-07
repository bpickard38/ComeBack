import type { ComponentProps } from 'react';

/**
 * White rounded box used for nearly every section of the app.
 * Extra classes change the look: card--dark, card--flush (no padding),
 * card--mist (pale blue, no border).
 */
export function Card({ className = '', ...rest }: ComponentProps<'section'>) {
  return <section className={`card ${className}`.trim()} {...rest} />;
}
