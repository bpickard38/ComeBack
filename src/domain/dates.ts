/*
  Calendar-day helpers. Rehab rules work in local calendar days ("did Maya do
  her exercises on Tuesday?"), not in 24-hour periods, so everything goes
  through dayKey().
*/

/** Local calendar day as "YYYY-MM-DD". Two times on the same day share a key. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Midnight at the start of the week (weeks start on Monday). */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7; // getDay(): Sunday = 0
  return addDays(start, -daysSinceMonday);
}

/** Every day from Monday up to and including `today`. */
export function daysThisWeek(today: Date): Date[] {
  const days: Date[] = [];
  for (let d = startOfWeek(today); dayKey(d) <= dayKey(today); d = addDays(d, 1)) {
    days.push(d);
  }
  return days;
}
