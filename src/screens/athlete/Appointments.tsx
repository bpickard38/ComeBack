import { Card } from '../../components/Card';
import { findLog } from '../../domain/logs';
import { formatDay, formatTime } from '../../format';
import { exerciseById, testById, useAppStore, useSignedInAthlete } from '../../store/AppStore';

export function Appointments() {
  const { state } = useAppStore();
  const me = useSignedInAthlete();
  const now = new Date();

  // Only visits that haven't started yet, soonest first.
  const upcoming = state.appointments
    .filter((a) => a.athleteId === me.id && new Date(a.startsAt) >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <>
      <Card>
        <h1>Appointments</h1>
        <p className="muted">What to work on before each visit.</p>
      </Card>

      {upcoming.length === 0 && (
        <Card>
          <p className="muted">No upcoming appointments. Your trainer will add your next visit here.</p>
        </Card>
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
          </div>
        </Card>
      ))}
    </>
  );
}
