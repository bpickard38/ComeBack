import { useEffect, useRef } from 'react';

/**
 * Keyboard helper. When a form or panel closes (`open` goes from true to
 * false), move focus back to the element holding the returned ref, usually
 * the button that opened it. Without this, keyboard and screen reader users
 * get dropped back at the top of the page.
 *
 *   const buttonRef = useReturnFocus(isOpen);
 *   <Button ref={buttonRef} ...>
 */
export function useReturnFocus<T extends HTMLElement = HTMLButtonElement>(open: boolean) {
  const ref = useRef<T>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return ref;
}
