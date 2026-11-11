import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import type { Team } from '../../domain/types';
import { supabase } from '../../store/supabase';

interface TeamCode {
  athleteCode: string;
  coachCode: string;
}

/**
 * Trainer-only card with one team's join codes to share. Only trainers can
 * read team_codes (see supabase/signup.sql), so this shows nothing for others.
 */
export function TeamCodes({ team }: { team: Team }) {
  // Remembers which team the codes belong to, so switching teams never
  // shows the last team's codes while the new ones load.
  const [loaded, setLoaded] = useState<{ teamId: string; codes: TeamCode | null } | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped to load again

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('team_codes')
      .select('athlete_code, coach_code')
      .eq('team_id', team.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Loading join codes failed', error);
          setError('Could not load your join codes.');
          return;
        }
        setError('');
        setLoaded({
          teamId: team.id,
          codes: data ? { athleteCode: data.athlete_code, coachCode: data.coach_code } : null,
        });
      });
    setConfirming(false);
    return () => {
      cancelled = true;
    };
  }, [team.id, attempt]);

  async function resetCodes() {
    setConfirming(false);
    const { error } = await supabase.rpc('reset_team_codes', { p_team: team.id });
    if (error) setError(error.message);
    else setAttempt((n) => n + 1);
  }

  if (error) return <p className="sign-in__error" role="alert">{error}</p>;
  const codes = loaded?.teamId === team.id ? loaded.codes : null;
  if (!codes) return null;

  return (
    <section className="card" aria-labelledby="team-codes-title">
      <h2 id="team-codes-title">Join codes for {team.name}</h2>
      <p className="muted">
        Share the matching code after someone creates an account. It adds them to this team only.
      </p>
      <div className="panel">
        <div className="row team-codes">
          <div>
            <div className="small muted">Athletes</div>
            <div className="join-code">{codes.athleteCode}</div>
          </div>
          <div>
            <div className="small muted">Coaches</div>
            <div className="join-code">{codes.coachCode}</div>
          </div>
        </div>
        {confirming ? (
          <div className="stack-sm">
            <p className="small">The old codes will stop working. People already on the team stay on it.</p>
            <div className="row">
              <Button variant="primary" onClick={resetCodes}>
                Make new codes
              </Button>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Make new codes
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
