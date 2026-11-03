import type { ComponentProps } from 'react';

interface ButtonProps extends ComponentProps<'button'> {
  /** Primary uses the accent; secondary uses a raised surface. */
  variant?: 'primary' | 'secondary';
}

/**
 * A real <button> with the shared styling and a 48px minimum touch target.
 * `...rest` passes along anything else you give it (onClick, aria-pressed,
 * ref, ...). ComponentProps<'button'> means "every prop a <button> accepts".
 */
export function Button({ variant = 'secondary', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`btn btn--${variant} ${className}`.trim()} {...rest} />;
}
