/*
  Short confirmation and error messages ("Logged: Calf raise at 6:10 PM").

  Toasts are screen-only state, so they live in their own small context
  instead of the saved app store. Any component can call:
    const { notify } = useToast();
    notify('Saved.');            // confirmation
    notify('Nope.', 'error');    // error styling
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ToastKind = 'ok' | 'error';

interface ToastMessage {
  id: number; // changes every time, so repeating the same text restarts the timer
  text: string;
  kind: ToastKind;
}

interface ToastValue {
  toast: ToastMessage | null;
  notify: (text: string, kind?: ToastKind) => void;
  dismiss: () => void;
}

// Errors stay longer because they're longer to read. The x closes either early.
const HIDE_AFTER_MS: Record<ToastKind, number> = { ok: 5000, error: 9000 };
const ToastContext = createContext<ToastValue | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Hide the toast after a few seconds. The returned function cancels the
  // timer if a newer toast replaces this one first.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), HIDE_AFTER_MS[toast.kind]);
    return () => clearTimeout(timer);
  }, [toast]);

  // useCallback/useMemo keep these the same object between renders, so
  // components using them don't re-render for no reason.
  const notify = useCallback((text: string, kind: ToastKind = 'ok') => {
    setToast({ id: nextId++, text, kind });
  }, []);
  const dismiss = useCallback(() => setToast(null), []);
  const value = useMemo(() => ({ toast, notify, dismiss }), [toast, notify, dismiss]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}

/**
 * Where toasts appear. The wrapper is a "polite live region": it's always on
 * the page, and screen readers announce new text inside it without
 * interrupting what they're currently reading.
 */
export function ToastRegion() {
  const { toast, dismiss } = useToast();
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className={toast.kind === 'error' ? 'toast toast--error' : 'toast'}>
          <span className="toast__text">{toast.text}</span>
          <button type="button" className="toast__close" aria-label="Dismiss message" onClick={dismiss}>
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
