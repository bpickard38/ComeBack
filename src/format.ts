/*
  Turning dates and numbers into display text. Kept apart from domain/
  because this is about presentation, not rules.
*/
const LOCALE = 'en-US';

/** "6:10 PM" */
export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
}

/** "Wed, Oct 7" */
export function formatDay(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Wed" */
export function formatWeekday(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, { weekday: 'short' });
}

/** 12 stays "12"; 12.25 becomes "12.25"; float noise like 7.499999 becomes "7.5". */
export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "1 point", "3 points" */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** "2026-10-21" (a calendar day with no time) to "Wed, Oct 21". */
export function formatCalendarDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return formatDay(new Date(y, m - 1, d)); // built in local time so the day doesn't shift
}
