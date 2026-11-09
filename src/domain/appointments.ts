import type { Appointment } from './types';

/** One athlete's visits that haven't started yet, soonest first. */
export function upcomingAppointments(appointments: Appointment[], athleteId: string, now: Date): Appointment[] {
  return appointments
    .filter((a) => a.athleteId === athleteId && new Date(a.startsAt) >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
