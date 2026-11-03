import { Link } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { addDays, dayKey, startOfWeek } from '../../domain/dates';
import { findLog } from '../../domain/logs';
import type { Exercise } from '../../domain/types';
import { formatDay, formatTime } from '../../format';
import { exerciseById, useAppStore, useSignedInAthlete } from '../../store/AppStore';

export function Week() {
  const { state } = useAppStore();
  const athlete = useSignedInAthlete();
  const today = new Date();
  const todayKey = dayKey(today);
  const monday = startOfWeek(today);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const exercises = athlete.assignedExerciseIds.map((id) => exerciseById(state, id));
  const elapsedDays = days.filter((day) => dayKey(day) <= todayKey);
  const doneCount = elapsedDays.reduce(
    (count, day) => count + exercises.filter((exercise) => findLog(state.logs, athlete.id, exercise.id, day)).length,
    0,
  );
  const expectedCount = exercises.length * elapsedDays.length;
  const percent = expectedCount ? Math.round((doneCount / expectedCount) * 100) : 0;

  return (
    <>
      <Card className="week-intro">
        <div className="eyebrow">{formatDay(monday)} – {formatDay(days[6])}</div>
        <h1>This week&rsquo;s plan</h1>
        <p className="muted">
          {exercises.length === 0
            ? 'Your trainer has not assigned any exercises yet.'
            : `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'} to work through each day.`}
        </p>
        {expectedCount > 0 && (
          <div className="stack-sm">
            <div className="spread strong">
              <span>{doneCount} logged so far</span>
              <span>{percent}%</span>
            </div>
            <ProgressBar percent={percent} />
          </div>
        )}
      </Card>

      {exercises.length === 0 ? (
        <Card className="week-empty">
          <h2 className="title">Your plan will show up here</h2>
          <p className="muted">Check back after your trainer assigns your rehab exercises.</p>
        </Card>
      ) : (
        <section className="week-days" aria-label="Daily exercise plan">
          {days.map((day) => {
            const key = dayKey(day);
            const isToday = key === todayKey;
            const isFuture = key > todayKey;
            const dayLogs = exercises.map((exercise) => ({
              exercise,
              log: findLog(state.logs, athlete.id, exercise.id, day),
            }));
            const dayDone = dayLogs.filter(({ log }) => log).length;

            return (
              <Card key={key} className={`week-day${isToday ? ' week-day--today' : ''}`} aria-current={isToday ? 'date' : undefined}>
                <div className="week-day__head">
                  <div>
                    <h2 className="title">{isToday ? 'Today' : formatDay(day)}</h2>
                    {isToday && <div className="small muted">{formatDay(day)}</div>}
                  </div>
                  {isFuture ? (
                    <Badge>Planned</Badge>
                  ) : (
                    <Badge tone={dayDone === exercises.length ? 'solid' : 'warn'}>
                      {dayDone} of {exercises.length} logged
                    </Badge>
                  )}
                </div>
                <ul className="week-exercises">
                  {dayLogs.map(({ exercise, log }) => (
                    <WeekExercise key={exercise.id} exercise={exercise} log={log} future={isFuture} />
                  ))}
                </ul>
                {isToday && (
                  <Link className="btn btn--secondary week-day__link" to="/athlete" aria-label="Open today’s exercises to log your work">
                    Open today&rsquo;s exercises <span aria-hidden="true">→</span>
                  </Link>
                )}
              </Card>
            );
          })}
        </section>
      )}
    </>
  );
}

function WeekExercise({ exercise, log, future }: { exercise: Exercise; log: { loggedAt: string } | undefined; future: boolean }) {
  const status = future ? 'Planned' : log ? `Logged ${formatTime(log.loggedAt)}` : 'Not logged';
  return (
    <li className={`week-exercise${log ? ' week-exercise--done' : ''}`}>
      <span className="week-exercise__mark" aria-hidden="true">{log ? '✓' : future ? '·' : '○'}</span>
      <span className="week-exercise__details">
        <span className="strong">{exercise.name}</span>
        <span className="small muted">{exercise.prescription}</span>
      </span>
      <span className="week-exercise__status small">{status}</span>
    </li>
  );
}
