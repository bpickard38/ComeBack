import type { ReactNode } from 'react';

export type AppIconName =
  | 'today'
  | 'week'
  | 'progress'
  | 'appointments'
  | 'messages'
  | 'roster'
  | 'availability'
  | 'assistant'
  | 'record'
  | 'exercises';

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
  assistant: (
    <>
      <path d="M10 4.5 11.6 9a2 2 0 0 0 1.4 1.4l4.5 1.6-4.5 1.6a2 2 0 0 0-1.4 1.4L10 19.5 8.4 15A2 2 0 0 0 7 13.6L2.5 12 7 10.4A2 2 0 0 0 8.4 9z" />
      <path d="M18.5 3v4M16.5 5h4M19 17v3M17.5 18.5h3" />
    </>
  ),
  availability: (
    <path d="M12 3 20 6v5.5c0 4.5-3.2 7.7-8 9.5-4.8-1.8-8-5-8-9.5V6z" />
  ),
  // A microphone: Record a visit.
  record: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  // A dumbbell: the exercise and injury library.
  exercises: (
    <>
      <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />
    </>
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
