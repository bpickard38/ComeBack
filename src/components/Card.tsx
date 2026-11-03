import type { ComponentProps } from 'react';

/**
 * Shared surface used for sections throughout the app.
 * Modifier classes provide an inverse, flush, accent-tinted, or emphasized surface.
 */
export function Card({ className = '', ...rest }: ComponentProps<'section'>) {
  return <section className={`card ${className}`.trim()} {...rest} />;
}
