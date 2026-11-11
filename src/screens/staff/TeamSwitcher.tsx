import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useReturnFocus } from '../../components/useReturnFocus';
import { unreadIn } from '../../domain/messages';
import { athletesOnTeam, teamThreads } from '../../domain/teams';
import { useAppStore, useTeam } from '../../store/AppStore';

/**
 * Lets a trainer or coach move between their teams. The roster, messages and
 * join codes below all follow the team picked here, and the choice is
 * remembered on this device. Trainers can also start another team.
 *
 * Someone with a single team who can't add more (a coach) sees nothing.
 */
export function TeamSwitcher() {
  const { state, commands, profile } = useAppStore();
  const { team } = useTeam();
  const [adding, setAdding] = useState(false);
  const addButtonRef = useReturnFocus(adding);
  const isTrainer = state.role === 'trainer';

  if (!team || (!isTrainer && state.teams.length < 2)) return null;

  return (
    <section className="stack-sm" aria-label="Your teams">
      <div className="team-switcher">
        {state.teams.map((t) => {
          const count = athletesOnTeam(state.athletes, t.id).length;
          // Only trainers have unread messages spread across teams.
          const unread = isTrainer
            ? teamThreads(state.athletes, t.id).filter((thread) => unreadIn(state.messages, thread, profile.id) > 0).length
            : 0;
          return (
            <button
              key={t.id}
              type="button"
              className="chip team-switcher__team"
              aria-pressed={t.id === team.id}
              onClick={() => commands.selectTeam(t.id)}
            >
              <span>{t.name}</span>
              <span className="small muted">
                {count} {count === 1 ? 'athlete' : 'athletes'}
                {unread > 0 && <span className="strong warn-text"> &middot; {unread} unread</span>}
              </span>
            </button>
          );
        })}
        {isTrainer && !adding && (
          <Button ref={addButtonRef} onClick={() => setAdding(true)}>
            New team
          </Button>
        )}
      </div>
      {adding && <NewTeamForm onClose={() => setAdding(false)} />}
    </section>
  );
}

/** Name, sport and school for another team. Saving switches to the new team. */
function NewTeamForm({ onClose }: { onClose: () => void }) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [sport, setSport] = useState('');
  const [school, setSchool] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await commands.createTeam({ name, sport, school });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    notify(`${name.trim()} created. Share its join codes to add athletes and coaches.`);
    onClose();
  }

  return (
    <form className="card stack-sm" onSubmit={submit} noValidate aria-labelledby="new-team-title">
      <h2 id="new-team-title">New team</h2>
      <p className="muted">Each team gets its own roster, coach conversation and join codes.</p>
      <label htmlFor="new-team-name" className="strong">
        Team name
      </label>
      <input
        id="new-team-name"
        className="field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-invalid={error ? true : undefined}
        autoFocus
        required
      />
      <label htmlFor="new-team-sport" className="strong">
        Sport <span className="normal muted">(optional)</span>
      </label>
      <input id="new-team-sport" className="field" value={sport} onChange={(e) => setSport(e.target.value)} />
      <label htmlFor="new-team-school" className="strong">
        School <span className="normal muted">(optional)</span>
      </label>
      <input id="new-team-school" className="field" value={school} onChange={(e) => setSchool(e.target.value)} />
      {error && (
        <p className="sign-in__error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Creating team…' : 'Create team'}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}
