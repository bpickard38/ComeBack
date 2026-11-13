import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { injuryDays, injuryHistory, NOTE_MAX_LENGTH, painHistory, pastAppointments, validateNote } from './history';
import type { Appointment, ExerciseLog, InjuryRecord } from './types';

const TODAY = new Date(2026, 10, 11, 14, 0); // Wed Nov 11 2026, 2:00 PM

function record(caseId: string, startDate: string, clearedAt: string | null, athleteId = 'maya'): InjuryRecord {
  return { caseId, athleteId, name: caseId, bodyRegion: null, startDate, clearedAt, exercises: [], goals: [] };
}

function log(daysAgo: number, pain: number | undefined, athleteId = 'maya'): ExerciseLog {
  return { athleteId, exerciseId: 'calf', loggedAt: addDays(TODAY, -daysAgo).toISOString(), pain };
}

describe('injuryHistory', () => {
  const ankle = record('ankle', '2026-10-21', null);
  const knee = record('knee', '2026-11-02', null);
  const hamstring = record('hamstring', '2026-03-01', '2026-04-10T16:00:00.000Z');
  const shoulder = record('shoulder', '2025-09-01', '2025-10-01T16:00:00.000Z');
  const someoneElse = record('wrist', '2026-10-01', null, 'jordan');

  it('puts active injuries first, then cleared ones newest first', () => {
    const order = injuryHistory([shoulder, knee, hamstring, ankle], 'maya').map((r) => r.caseId);
    expect(order).toEqual(['ankle', 'knee', 'hamstring', 'shoulder']);
  });

  it('leaves out other athletes', () => {
    expect(injuryHistory([ankle, someoneElse], 'maya')).toEqual([ankle]);
  });

  it('is empty for an athlete with nothing on file', () => {
    expect(injuryHistory([someoneElse], 'maya')).toEqual([]);
  });
});

describe('injuryDays', () => {
  it('counts to today for an active injury', () => {
    expect(injuryDays(record('ankle', '2026-10-21', null), TODAY)).toBe(21);
  });

  it('counts to the day it was cleared', () => {
    const clearedAt = new Date(2026, 3, 10, 9, 30).toISOString();
    expect(injuryDays(record('hamstring', '2026-03-31', clearedAt), TODAY)).toBe(10);
  });

  it('is 0 for an injury that started today', () => {
    expect(injuryDays(record('new', '2026-11-11', null), TODAY)).toBe(0);
  });
});

describe('painHistory', () => {
  it('finds the highest rating and the high reports, newest first', () => {
    const logs = [log(5, 6), log(0, 2), log(1, 7), log(3, 4)];
    const history = painHistory(logs, 'maya', TODAY);
    expect(history.rated).toBe(4);
    expect(history.highest).toBe(7);
    expect(history.high.map((l) => l.pain)).toEqual([7, 6]);
  });

  it('counts the 14th day back but not the 15th', () => {
    expect(painHistory([log(13, 8)], 'maya', TODAY).highest).toBe(8);
    expect(painHistory([log(14, 8)], 'maya', TODAY).highest).toBeNull();
  });

  it('ignores logs without a rating and other athletes', () => {
    const history = painHistory([log(1, undefined), log(1, 9, 'jordan')], 'maya', TODAY);
    expect(history).toEqual({ rated: 0, highest: null, high: [] });
  });
});

describe('pastAppointments', () => {
  const visit = (id: string, daysFromNow: number, athleteId = 'maya'): Appointment => ({
    id,
    athleteId,
    startsAt: addDays(TODAY, daysFromNow).toISOString(),
    location: '',
    title: id,
    testIds: [],
    exerciseIds: [],
  });

  it('keeps only visits that already started, most recent first', () => {
    const list = pastAppointments([visit('old', -10), visit('next', 2), visit('recent', -1), visit('other', -1, 'jordan')], 'maya', TODAY);
    expect(list.map((a) => a.id)).toEqual(['recent', 'old']);
  });
});

describe('validateNote', () => {
  it('trims the note', () => {
    expect(validateNote('  Left ACL repair in 2024.  ')).toEqual({ ok: true, value: 'Left ACL repair in 2024.' });
  });

  it('allows an empty note, which clears it', () => {
    expect(validateNote('   ')).toEqual({ ok: true, value: '' });
  });

  it('refuses a note longer than the database allows', () => {
    expect(validateNote('x'.repeat(NOTE_MAX_LENGTH)).ok).toBe(true);
    expect(validateNote('x'.repeat(NOTE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});
