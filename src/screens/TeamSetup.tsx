import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import type { Profile } from '../store/profile';
import { supabase } from '../store/supabase';

interface TeamSetupProps {
  profile: Profile;
  /** Called once they're on a team, so AuthGate loads again and opens the app. */
  onJoined: () => void;
  /** Why a join link they followed didn't work, if one didn't. */
  problem?: string;
}

/**
 * First stop after sign-up. Trainers create their team (and get join codes);
 * athletes and coaches join one with the code their trainer gave them.
 * The checks happen in the database: create_team and join_team in
 * supabase/signup.sql.
 */
export function TeamSetup({ profile, onJoined, problem = '' }: TeamSetupProps) {
  const isTrainer = profile.role === 'trainer';
  const [teamName, setTeamName] = useState('');
  const [sport, setSport] = useState('');
  const [school, setSchool] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(problem);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (isTrainer ? !teamName.trim() : !code.trim()) {
      setError(isTrainer ? 'Give your team a name.' : 'Enter the join code from your athletic trainer.');
      return;
    }
    setBusy(true);
    setError('');
    const { error } = isTrainer
      ? await supabase.rpc('create_team', { p_name: teamName, p_sport: sport, p_school: school })
      : await supabase.rpc('join_team', { p_code: code });
    setBusy(false);
    if (error) setError(error.message);
    else onJoined();
  }

  const who = profile.role === 'coach' ? 'coach' : 'athlete';

  return (
    <main className="main">
      <form className="column card sign-in" onSubmit={submit} noValidate>
        <h1>{isTrainer ? 'Create your team' : 'Join your team'}</h1>
        {isTrainer ? (
          <>
            <p className="muted">
              Create a team to get separate join codes for athletes and coaches.
            </p>
            <label htmlFor="team-name" className="strong">
              Team name
            </label>
            <input id="team-name" className="field" value={teamName} onChange={(e) => setTeamName(e.target.value)} required />
            <label htmlFor="team-sport" className="strong">
              Sport <span className="normal muted">(optional)</span>
            </label>
            <input id="team-sport" className="field" value={sport} onChange={(e) => setSport(e.target.value)} />
            <label htmlFor="team-school" className="strong">
              School <span className="normal muted">(optional)</span>
            </label>
            <input id="team-school" className="field" value={school} onChange={(e) => setSchool(e.target.value)} />
          </>
        ) : (
          <>
            <p className="muted">
              Get the {who} join code from your athletic trainer.
            </p>
            <label htmlFor="join-code" className="strong">
              Join code
            </label>
            <input
              id="join-code"
              className="field join-code"
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        )}

        {error && (
          <p className="sign-in__error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? isTrainer ? 'Creating team…' : 'Joining team…' : isTrainer ? 'Create team' : 'Join team'}
        </Button>
        <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </form>
    </main>
  );
}
