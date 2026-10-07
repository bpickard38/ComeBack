import type { ComponentProps } from 'react';

interface ButtonProps extends ComponentProps<'button'> {
  /** primary = filled navy, secondary = white with navy border, link = underlined text */
  variant?: 'primary' | 'secondary' | 'link';
}

/**
 * A real <button> with the app's styling and a 44px touch target.
 * `...rest` passes along anything else you give it (onClick, aria-pressed,
 * ref, ...). ComponentProps<'button'> means "every prop a <button> accepts".
 */
export function Button({ variant = 'secondary', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`btn btn--${variant} ${className}`.trim()} {...rest} />;
}
