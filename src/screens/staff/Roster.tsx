import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Chat';
import { ProfilePhoto } from '../../components/ProfilePhoto';
import { athleteThread, unreadIn } from '../../domain/messages';
import { highestRecentPain, isHighPain } from '../../domain/pain';
import { isInjured } from '../../domain/roster';
import { aboutThread } from '../../domain/teams';
import type { Athlete } from '../../domain/types';
import { weekCompletion, weekStatus } from '../../domain/week';
import { injuryLabel } from '../../format';
import { useAppStore, useTeam } from '../../store/AppStore';


/**
 * One short row per athlete: photo (or initials), name, injury, and one
 * status word on the right. Anything that needs the trainer (high pain,
 * an unread message) shows in words under the name. The day and week
 * numbers live on the profile, which a tap opens.
 */
export function Roster({ athletes }: { athletes: Athlete[] }) {
  const { state, profile } = useAppStore();
  const { team } = useTeam();
  const now = new Date();

  return (
    <section className="card card--flush" aria-label="Athletes">
      {athletes.map((a) => {
        const pain = highestRecentPain(state.logs, a.id, now);
        const flags = [
          isHighPain(pain ?? undefined) ? `Pain ${pain}/10` : null,
          unreadIn(state.messages, athleteThread(a.id), profile.id) > 0 ? 'New message' : null,
          team && unreadIn(state.messages, aboutThread(team.id, a.id), profile.id) > 0 ? 'Coach asked' : null,
        ].filter(Boolean);
        const status = !isInjured(a)
          ? 'Healthy'
          : a.assignedExerciseIds.length === 0
            ? 'No plan yet'
            : weekStatus(weekCompletion(a, state.logs, now));
        return (
          <Link key={a.id} to={`/staff/athletes/${a.id}`} className="roster-row">
            {a.photoUrl ? <ProfilePhoto url={a.photoUrl} size="md" /> : <Avatar name={a.name} />}
            <span className="stack-xs roster-row__main">
              <span className="roster-row__name">{a.name}</span>
              <span className="small muted">{isInjured(a) ? injuryLabel(a) : a.sport}</span>
              {flags.length > 0 && <span className="small strong warn-text">{flags.join(' · ')}</span>}
            </span>
            <span className={status === 'Behind' || status === 'No plan yet' ? 'small strong nowrap warn-text' : 'small strong nowrap'}>{status}</span>
          </Link>
        );
      })}
    </section>
  );
}
