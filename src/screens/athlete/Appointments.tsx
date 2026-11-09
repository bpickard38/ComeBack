import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { type CalendarEvent, googleCalendarUrl, icsFile, outlookCalendarUrl } from '../../domain/calendar';
import { findLog } from '../../domain/logs';
import { formatDay, formatTime } from '../../format';
import type { Appointment } from '../../domain/types';
import { exerciseById, testById, useAppStore, useSignedInAthlete } from '../../store/AppStore';

/** Visits that haven't started yet, soonest first. */
export function upcomingAppointments(appointments: Appointment[], athleteId: string, now: Date): Appointment[] {
  return appointments
    .filter((a) => a.athleteId === athleteId && new Date(a.startsAt) >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The athlete's upcoming visits in full. Shown on the Trainer tab. */
export function Appointments() {
  const { state } = useAppStore();
  const me = useSignedInAthlete();
  const now = new Date();
  const upcoming = upcomingAppointments(state.appointments, me.id, now);

  return (
    <>
      {upcoming.length === 0 && (
        <p className="muted">No upcoming appointments. Your trainer will add your next visit here.</p>
      )}

      {upcoming.map((ap) => (
        <Card key={ap.id} className="card--flush">
          <div className="appt-head">
            <span className="strong">
              {formatDay(ap.startsAt)} &middot; {formatTime(ap.startsAt)}
            </span>
            <span>{ap.location}</span>
          </div>
          <div className="appt-body">
            <h2 className="title">{ap.title}</h2>

            {ap.testIds.length > 0 && (
              <div className="stack-sm">
                <h3 className="label">Milestones to work toward</h3>
                {ap.testIds.map((id) => {
                  const test = testById(state, id);
                  return (
                    <div key={id} className="line">
                      <span>{test.name}</span>
                      <span className="strong">{ap.testNotes?.[id] ?? `Target ${test.target} ${test.unit}`}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {ap.exerciseIds.length > 0 && (
              <div className="stack-sm">
                <h3 className="label">Exercises to focus on</h3>
                {ap.exerciseIds.map((id) => {
                  const ex = exerciseById(state, id);
                  const done = Boolean(findLog(state.logs, me.id, id, now));
                  return (
                    <div key={id} className="line">
                      <span>
                        {ex.name} <span className="muted">&middot; {ex.prescription}</span>
                      </span>
                      <span className={done ? 'strong nowrap' : 'strong nowrap warn-text'}>
                        {done ? 'Done today' : 'Not done today'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <AddToCalendar
              event={{
                id: ap.id,
                title: ap.title,
                location: ap.location,
                startsAt: ap.startsAt,
                details: [
                  ...ap.testIds.map((id) => `Milestone: ${testById(state, id).name}`),
                  ...ap.exerciseIds.map((id) => `Exercise: ${exerciseById(state, id).name}`),
                ].join('\n'),
              }}
            />
          </div>
        </Card>
      ))}
    </>
  );
}

/** Links that open the visit pre-filled in the athlete's own calendar. */
function AddToCalendar({ event }: { event: CalendarEvent }) {
  function downloadIcs() {
    const url = URL.createObjectURL(new Blob([icsFile(event)], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <details className="add-cal">
      <summary className="btn btn--secondary">Add to calendar</summary>
      <div className="add-cal-options">
        <a className="btn btn--secondary" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
          Google
        </a>
        <a className="btn btn--secondary" href={outlookCalendarUrl(event)} target="_blank" rel="noreferrer">
          Outlook
        </a>
        <a
          className="btn btn--secondary"
          href={outlookCalendarUrl(event, 'outlook.office.com')}
          target="_blank"
          rel="noreferrer"
        >
          Outlook (school)
        </a>
        <Button onClick={downloadIcs}>Apple / other</Button>
      </div>
    </details>
  );
}
