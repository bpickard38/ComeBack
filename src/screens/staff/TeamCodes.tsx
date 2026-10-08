import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { useAppStore } from '../../store/AppStore';
import { supabase } from '../../store/supabase';

interface TeamCode {
  teamId: string;
  teamName: string;
  athleteCode: string;
  coachCode: string;
}

/**
 * Trainer-only card with each team's join codes to share. Only trainers can
 * read team_codes (see supabase/signup.sql), so this shows nothing for others.
 */
export function TeamCodes() {
  const { profile } = useAppStore();
  const [codes, setCodes] = useState<TeamCode[] | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null); // team id about to get new codes
  const [attempt, setAttempt] = useState(0); // bumped to load again

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('team_codes')
      .select('team_id, athlete_code, coach_code, teams(name)')
      .in('team_id', profile.teamIds)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Loading join codes failed', error);
          setError('Could not load your join codes.');
          return;
        }
        setError('');
        setCodes(
          data.map((row) => ({
            teamId: row.team_id,
            // teams(name) comes back as a nested object from the join.
            teamName: (row.teams as unknown as { name: string } | null)?.name ?? 'Your team',
            athleteCode: row.athlete_code,
            coachCode: row.coach_code,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [profile.teamIds, attempt]);

  async function resetCodes(teamId: string) {
    setConfirming(null);
    const { error } = await supabase.rpc('reset_team_codes', { p_team: teamId });
    if (error) setError(error.message);
    else setAttempt((n) => n + 1);
  }

  if (error) return <p className="sign-in__error" role="alert">{error}</p>;
  if (!codes || codes.length === 0) return null;

  return (
    <section className="card" aria-labelledby="team-codes-title">
      <h2 id="team-codes-title">Join codes</h2>
      <p className="muted">
        Share these so people can join your team after they create an account. Each code only works for its role.
      </p>
      {codes.map((c) => (
        <div key={c.teamId} className="panel">
          {codes.length > 1 && <div className="strong">{c.teamName}</div>}
          <div className="row team-codes">
            <div>
              <div className="small muted">Athletes</div>
              <div className="join-code">{c.athleteCode}</div>
            </div>
            <div>
              <div className="small muted">Coaches</div>
              <div className="join-code">{c.coachCode}</div>
            </div>
          </div>
          {confirming === c.teamId ? (
            <div className="stack-sm">
              <p className="small">The old codes will stop working. People already on the team stay on it.</p>
              <div className="row">
                <Button variant="primary" onClick={() => resetCodes(c.teamId)}>
                  Make new codes
                </Button>
                <Button onClick={() => setConfirming(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div>
              <Button variant="link" onClick={() => setConfirming(c.teamId)}>
                Make new codes
              </Button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
