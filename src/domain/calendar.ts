/*
  Putting an appointment on the athlete's own calendar. No sign-in needed:
  Google and Outlook both accept a link that opens a pre-filled "new event"
  page, and an .ics file covers Apple Calendar and the Outlook desktop app.
*/

/** Appointments only store a start time, so every visit is booked as an hour. */
export const APPOINTMENT_MINUTES = 60;

export interface CalendarEvent {
  /** Stable id, so re-adding the same .ics updates the event instead of duplicating it. */
  id: string;
  title: string;
  location: string;
  startsAt: string;
  details: string;
}

function endOf(event: CalendarEvent): Date {
  return new Date(new Date(event.startsAt).getTime() + APPOINTMENT_MINUTES * 60_000);
}

/** 2026-10-07T15:30:00.000Z to "20261007T153000Z", the format Google and .ics use. */
function compactUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compactUtc(new Date(event.startsAt))}/${compactUtc(endOf(event))}`,
    location: event.location,
    details: event.details,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Personal Outlook.com accounts. School and work accounts use outlook.office.com instead. */
export function outlookCalendarUrl(event: CalendarEvent, host = 'outlook.live.com'): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: new Date(event.startsAt).toISOString(),
    enddt: endOf(event).toISOString(),
    location: event.location,
    body: event.details,
  });
  return `https://${host}/calendar/0/deeplink/compose?${params}`;
}

/** .ics text needs commas, semicolons, backslashes and newlines escaped. */
function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function icsFile(event: CalendarEvent, now = new Date()): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ComeBack//Appointments//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@comeback`,
    `DTSTAMP:${compactUtc(now)}`,
    `DTSTART:${compactUtc(new Date(event.startsAt))}`,
    `DTEND:${compactUtc(endOf(event))}`,
    `SUMMARY:${icsText(event.title)}`,
    `LOCATION:${icsText(event.location)}`,
    `DESCRIPTION:${icsText(event.details)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'); // the .ics format requires CRLF line endings
}
