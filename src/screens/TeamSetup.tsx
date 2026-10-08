import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import type { Profile } from '../store/profile';
import { supabase } from '../store/supabase';

interface TeamSetupProps {
  profile: Profile;
  /** Called once they're on a team, so AuthGate loads again and opens the app. */
  onJoined: () => void;
}

/**
 * First stop after sign-up. Trainers create their team (and get join codes);
 * athletes and coaches join one with the code their trainer gave them.
 * The checks happen in the database: create_team and join_team in
 * supabase/signup.sql.
 */
export function TeamSetup({ profile, onJoined }: TeamSetupProps) {
  const isTrainer = profile.role === 'trainer';
  const [teamName, setTeamName] = useState('');
  const [sport, setSport] = useState('');
  const [school, setSchool] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
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
        <h1>Hi, {profile.name}</h1>
        {isTrainer ? (
          <>
            <p className="muted">
              Create your team. You'll get one join code for athletes and one for coaches to share with them.
            </p>
            <label htmlFor="team-name" className="strong">
              Team name
            </label>
            <input id="team-name" className="field" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
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
              Enter the {who} join code from your athletic trainer to join your team.
            </p>
            <label htmlFor="join-code" className="strong">
              Join code
            </label>
            <input
              id="join-code"
              className="field join-code"
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
          {busy ? 'One moment…' : isTrainer ? 'Create team' : 'Join team'}
        </Button>
        <Button variant="link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </form>
    </main>
  );
}
