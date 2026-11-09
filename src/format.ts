/*
  Turning dates and numbers into display text. Kept apart from domain/
  because this is about presentation, not rules.
*/
import type { Athlete } from './domain/types';

const LOCALE = 'en-US';

/** "Ankle sprain, Hamstring strain", or "No injury on file". */
export function injuryLabel(athlete: Pick<Athlete, 'injuries'>): string {
  return athlete.injuries.length ? athlete.injuries.map((i) => i.name).join(', ') : 'No injury on file';
}

/** "6:10 PM" */
export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
}

/** "Wed, Oct 7" */
export function formatDay(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "6:10 PM" for today, otherwise "Wed, Oct 7, 6:10 PM". For message times. */
export function formatSentAt(value: string | Date): string {
  const date = new Date(value);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? formatTime(date) : `${formatDay(date)}, ${formatTime(date)}`;
}

/** "now", "5m", "3h", "2d", "4w": how long ago, short, for inbox rows. */
export function formatAgo(value: string | Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : `${Math.floor(days / 7)}w`;
}

/** "Maya Torres" to "MT", for avatars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? '?' : (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** "Wed" */
export function formatWeekday(value: string | Date): string {
  return new Date(value).toLocaleDateString(LOCALE, { weekday: 'short' });
}

/** 12 stays "12"; 12.25 becomes "12.25"; float noise like 7.499999 becomes "7.5". */
export function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "1 day", "3 days" */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** "2026-10-21" (a calendar day with no time) to "Wed, Oct 21". */
export function formatCalendarDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return formatDay(new Date(y, m - 1, d)); // built in local time so the day doesn't shift
}
