import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { QrCode } from '../../components/QrCode';
import { useToast } from '../../components/Toast';
import { inviteText, joinLink, type JoinRole } from '../../domain/join';
import type { Team } from '../../domain/types';
import { supabase } from '../../store/supabase';

interface TeamCode {
  athleteCode: string;
  coachCode: string;
}

/**
 * Trainer-only card for getting people onto one team: a join code to read
 * out, a link to share to a group chat, and a QR code to scan. The link and
 * QR code take someone to sign up (or sign in) and then add them to the team
 * without typing the code. Only trainers can read team_codes (see
 * supabase/signup.sql), so this shows nothing for others.
 */
export function TeamCodes({ team, onClose }: { team: Team; onClose?: () => void }) {
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
      <div className="spread">
        <div className="stack-xs">
          <h2 id="team-codes-title">Join {team.name}</h2>
          <p className="muted">
            Share a link or let someone scan the code: it takes them to sign up, or sign in, and adds them to this team. They
            can also type the join code after creating an account.
          </p>
        </div>
        {onClose && <Button onClick={onClose}>Close</Button>}
      </div>

      <div className="invite-grid">
        <Invite team={team} role="athlete" title="Athletes" code={codes.athleteCode} />
        <Invite team={team} role="coach" title="Coaches" code={codes.coachCode} />
      </div>

      {confirming ? (
        <div className="stack-sm">
          <p className="small">
            The old codes, links and QR codes will stop working. People already on the team stay on it.
          </p>
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
    </section>
  );
}

/** One role's code, QR code and ways to send its link. */
function Invite({ team, role, title, code }: { team: Team; role: JoinRole; title: string; code: string }) {
  const { notify } = useToast();
  const link = joinLink(window.location.origin, code, role);
  const text = inviteText(team.name, role, code);
  // Phones (and some desktop browsers) have a share sheet with every chat app on it.
  const canShare = typeof navigator.share === 'function';

  async function share() {
    try {
      await navigator.share({ title: `Join ${team.name} on Comeback`, text, url: link });
    } catch {
      // They closed the share sheet; nothing to do.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      notify(`${title} link copied. Paste it into a group chat.`);
    } catch {
      notify(`Couldn't copy. Select the link under the QR code and copy it by hand.`, 'error');
    }
  }

  return (
    <div className="panel invite">
      <div className="stack-xs">
        <div className="strong">{title}</div>
        <div className="small muted">Join code</div>
        <div className="join-code">{code}</div>
      </div>
      <QrCode value={link} label={`QR code to join ${team.name} as ${role === 'athlete' ? 'an athlete' : 'a coach'}`} />
      <div className="small muted invite__link">{link}</div>
      <div className="row">
        {canShare && (
          <Button variant="primary" onClick={share}>
            Share link
          </Button>
        )}
        <Button variant={canShare ? 'secondary' : 'primary'} onClick={copy}>
          Copy link
        </Button>
        <a
          className="btn btn--secondary"
          href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
        <a className="btn btn--secondary" href={`sms:?&body=${encodeURIComponent(`${text} ${link}`)}`}>
          Text
        </a>
      </div>
    </div>
  );
}
