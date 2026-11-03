import { describe, expect, it } from 'vitest';
import { googleCalendarUrl, icsFile, outlookCalendarUrl, type CalendarEvent } from './calendar';

const event: CalendarEvent = {
  id: 'ap1',
  title: 'Weekly check-in',
  location: 'Training room, Field house',
  startsAt: '2026-10-07T15:30:00.000Z',
  details: 'Milestone: Balance\nExercise: Calf raise',
};

describe('add to calendar', () => {
  it('Google link books a one-hour event in UTC', () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get('dates')).toBe('20261007T153000Z/20261007T163000Z');
    expect(url.searchParams.get('text')).toBe('Weekly check-in');
  });

  it('Outlook link uses the chosen host', () => {
    const url = new URL(outlookCalendarUrl(event, 'outlook.office.com'));
    expect(url.host).toBe('outlook.office.com');
    expect(url.searchParams.get('enddt')).toBe('2026-10-07T16:30:00.000Z');
  });

  it('.ics escapes commas and newlines', () => {
    const ics = icsFile(event, new Date('2026-10-01T00:00:00Z'));
    expect(ics).toContain('LOCATION:Training room\\, Field house');
    expect(ics).toContain('DESCRIPTION:Milestone: Balance\\nExercise: Calf raise');
    expect(ics).toContain('UID:ap1@comeback');
  });
});
