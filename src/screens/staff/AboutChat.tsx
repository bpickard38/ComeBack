import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ChatThread } from '../../components/Chat';
import { aboutThread } from '../../domain/teams';
import type { Athlete, Team } from '../../domain/types';
import { useAppStore } from '../../store/AppStore';

interface AboutChatProps {
  athlete: Pick<Athlete, 'id' | 'name'>;
  team: Team;
  /** Who you're talking to, e.g. "Coach" or the trainer's name. */
  name: string;
  detail: string;
  /** Shows a back arrow (phones only) that calls this. */
  onBack?: () => void;
}

/**
 * The private conversation between a team's trainers and coaches about one
 * athlete. The athlete is never in it. The database creates it the first
 * time someone opens it (supabase/coach_athlete_chat.sql), so this asks for
 * it, then shows the chat.
 */
export function AboutChat({ athlete, team, name, detail, onBack }: AboutChatProps) {
  const { state, commands } = useAppStore();
  const thread = aboutThread(team.id, athlete.id);
  const ready = state.conversations.some((c) => c.thread === thread);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped to try again

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    setFailed(false);
    commands.openAboutChat(team.id, athlete.id).then((result) => {
      if (!cancelled && !result.ok) {
        console.error('Opening the conversation failed', result.error);
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // commands is left out on purpose: it's rebuilt every render.
  }, [ready, team.id, athlete.id, attempt]);

  if (ready) return <ChatThread thread={thread} name={name} detail={detail} onBack={onBack} />;

  return (
    <Card>
      {failed ? (
        <div className="stack-sm" role="alert">
          <p className="muted">
            Couldn't open the conversation about {athlete.name}. Check your connection. If it keeps happening, ask whoever set
            up the database to run the coach chat script.
          </p>
          <div className="row">
            <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
            {onBack && <Button onClick={onBack}>Back</Button>}
          </div>
        </div>
      ) : (
        <p className="muted" role="status">
          Opening the conversation…
        </p>
      )}
    </Card>
  );
}
