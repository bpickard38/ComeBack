import type { ReactNode } from 'react';

export type AppIconName =
  | 'today'
  | 'week'
  | 'progress'
  | 'trophies'
  | 'appointments'
  | 'messages'
  | 'roster'
  | 'availability';

const PATHS: Record<AppIconName, ReactNode> = {
  today: (
    <>
      <path d="m3.5 10 8.5-7 8.5 7" />
      <path d="M5.5 9v11h13V9M9 20v-6h6v6" />
    </>
  ),
  week: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </>
  ),
  progress: (
    <>
      <path d="M4 19.5h16M5.5 16l4-4 3 2.5 6-7" />
      <path d="M14.5 7.5h4v4" />
    </>
  ),
  trophies: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4" />
    </>
  ),
  appointments: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M7.5 3v4M16.5 3v4M3.5 10h10" />
      <circle cx="16.5" cy="16" r="3.5" />
      <path d="M16.5 14v2l1.5 1" />
    </>
  ),
  messages: (
    <>
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1.5 2v-5.5A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" />
    </>
  ),
  roster: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 6.8M17 14a6 6 0 0 1 4.5 5.8" />
    </>
  ),
  availability: (
    <path d="M12 3 20 6v5.5c0 4.5-3.2 7.7-8 9.5-4.8-1.8-8-5-8-9.5V6z" />
  ),
};

/** One consistent, decorative outline icon set for navigation and status. */
export function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  return (
    <svg
      className={`icon app-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
