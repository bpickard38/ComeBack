import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useReturnFocus } from '../../components/useReturnFocus';
import { upcomingAppointments } from '../../domain/appointments';
import { dayKey } from '../../domain/dates';
import type { Appointment, Athlete } from '../../domain/types';
import { formatDay, formatTime } from '../../format';
import { exerciseById, testsFor, useAppStore } from '../../store/AppStore';
import { Chip, ChipGroup } from './AssignForm';

const DEFAULT_TITLE = 'Rehab check-in';

/**
 * Trainer only: the athlete's upcoming visits, a way to cancel one, and a
 * form to book a new one. The athlete sees new visits on Today and on their
 * Trainer tab after the next refresh (within 30 seconds).
 */
export function AppointmentScheduler({ athlete }: { athlete: Athlete }) {
  const { state } = useAppStore();
  const [open, setOpen] = useState(false);
  const scheduleButtonRef = useReturnFocus(open);
  const upcoming = upcomingAppointments(state.appointments, athlete.id, new Date());
  const headingId = `appts-${athlete.id}`;

  return (
    <section className="panel stack-sm" aria-labelledby={headingId}>
      <h3 id={headingId} className="strong">
        Upcoming appointments{upcoming.length > 0 && ` (${upcoming.length})`}
      </h3>

      {upcoming.length === 0 ? (
        <p className="small muted">Nothing scheduled with {athlete.name}.</p>
      ) : (
        <ul className="appt-list">
          {upcoming.map((ap) => (
            <AppointmentRow key={ap.id} appointment={ap} />
          ))}
        </ul>
      )}

      {open ? (
        <ScheduleForm athlete={athlete} onClose={() => setOpen(false)} />
      ) : (
        <Button ref={scheduleButtonRef} className="align-start strong" onClick={() => setOpen(true)}>
          Schedule appointment
        </Button>
      )}
    </section>
  );
}

/** One visit, with a two-step cancel so a stray tap can't cancel it. */
function AppointmentRow({ appointment: ap }: { appointment: Appointment }) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function cancel() {
    setSaving(true);
    const result = await commands.cancelAppointment(ap.id);
    setSaving(false);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    notify(`Cancelled ${ap.title} on ${formatDay(ap.startsAt)}.`);
  }

  return (
    <li className="appt-list__item">
      <div className="stack-xs">
        <span className="strong">
          {formatDay(ap.startsAt)} &middot; {formatTime(ap.startsAt)}
        </span>
        <span className="small muted">
          {ap.title}
          {ap.location && <> &middot; {ap.location}</>}
          {ap.testIds.length + ap.exerciseIds.length > 0 && (
            <> &middot; {ap.testIds.length + ap.exerciseIds.length} focus items</>
          )}
        </span>
      </div>
      {confirming ? (
        <div className="row">
          <Button variant="primary" disabled={saving} onClick={cancel}>
            {saving ? 'Cancelling…' : 'Yes, cancel it'}
          </Button>
          <Button onClick={() => setConfirming(false)}>Keep it</Button>
        </div>
      ) : (
        <Button onClick={() => setConfirming(true)}>Cancel</Button>
      )}
    </li>
  );
}

function ScheduleForm({ athlete, onClose }: { athlete: Athlete; onClose: () => void }) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const tests = testsFor(state, athlete.id);
  // Start on the same location as the last visit booked, so it's rarely retyped.
  const lastLocation = [...state.appointments].reverse().find((a) => a.location)?.location ?? '';
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('15:30');
  const [location, setLocation] = useState(lastLocation);
  const [testIds, setTestIds] = useState<string[]>([]);
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const id = (field: string) => `appt-${field}-${athlete.id}`;

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await commands.scheduleAppointment({
      athleteId: athlete.id,
      title,
      date,
      time,
      location,
      testIds,
      exerciseIds,
    });
    setSaving(false);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    notify(
      `Scheduled ${result.value.title} with ${athlete.name} on ${formatDay(result.value.startsAt)} at ${formatTime(result.value.startsAt)}.`,
    );
    onClose();
  }

  return (
    <form className="stack-sm" onSubmit={submit} noValidate aria-label={`Schedule an appointment with ${athlete.name}`}>
      <div className="stack-xs">
        <label htmlFor={id('title')} className="small strong">
          Title
        </label>
        <input id={id('title')} className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>

      <div className="appt-form__when">
        <div className="stack-xs">
          <label htmlFor={id('date')} className="small strong">
            Date
          </label>
          <input
            id={id('date')}
            type="date"
            className="field field--date"
            min={dayKey(new Date())}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="stack-xs">
          <label htmlFor={id('time')} className="small strong">
            Time
          </label>
          <input
            id={id('time')}
            type="time"
            className="field field--date"
            step={900}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      <div className="stack-xs">
        <label htmlFor={id('location')} className="small strong">
          Location <span className="muted normal">(optional)</span>
        </label>
        <input
          id={id('location')}
          className="field"
          placeholder="Training room"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      {tests.length > 0 && (
        <ChipGroup legend="Milestones to retest" hint="(optional)">
          {tests.map((t) => (
            <Chip key={t.id} pressed={testIds.includes(t.id)} onClick={() => setTestIds(toggle(testIds, t.id))}>
              {t.name}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {athlete.assignedExerciseIds.length > 0 && (
        <ChipGroup legend="Exercises to focus on" hint="(optional)">
          {athlete.assignedExerciseIds.map((exId) => (
            <Chip
              key={exId}
              pressed={exerciseIds.includes(exId)}
              onClick={() => setExerciseIds(toggle(exerciseIds, exId))}
            >
              {exerciseById(state, exId).name}
            </Chip>
          ))}
        </ChipGroup>
      )}

      <div className="row">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Schedule'}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}
