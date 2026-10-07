import type { ReactNode } from 'react';

/** Small pill label: "Logged 6:10 PM", "Not done", "64% there". */
export function Badge({ tone = 'outline', children }: { tone?: 'solid' | 'outline' | 'warn'; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
