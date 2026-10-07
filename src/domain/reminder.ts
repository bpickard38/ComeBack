/** Hour (24h, local time) after which the end-of-day reminder shows. */
export const REMINDER_HOUR = 18;

export function shouldShowReminder(now: Date, exercisesLeft: number): boolean {
  return exercisesLeft > 0 && now.getHours() >= REMINDER_HOUR;
}
