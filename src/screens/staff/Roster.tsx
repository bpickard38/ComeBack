import { doneOnDay } from '../../domain/logs';
import { needsReply } from '../../domain/messages';
import { highestRecentPain, isHighPain } from '../../domain/pain';
import type { Athlete } from '../../domain/types';
import { weekCompletion, weekStatus } from '../../domain/week';
import { useAppStore } from '../../store/AppStore';

interface RosterProps {
  athletes: Athlete[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

/**
 * One row per athlete: today's count, week %, On track / Behind, plus flags
 * for recent high pain and unanswered messages. Everything is in words, not
 * just color.
 */
export function Roster({ athletes, selectedId, onSelect }: RosterProps) {
  const { state } = useAppStore();
  const now = new Date();

  return (
    <section className="card card--flush" aria-label="Athletes">
      <div className="table-head">
        <span>Athlete</span>
        <span>Today &middot; Week &middot; Status</span>
      </div>
      {athletes.map((a) => {
        const week = weekCompletion(a, state.logs, now);
        const status = weekStatus(week);
        const pain = highestRecentPain(state.logs, a.id, now);
        const flags = [
          isHighPain(pain ?? undefined) ? `Pain ${pain} reported` : null,
          needsReply(state.messages, a.id) ? 'New message' : null,
        ].filter(Boolean);
        return (
          <button
            key={a.id}
            type="button"
            className="roster-row"
            aria-pressed={a.id === selectedId}
            onClick={() => onSelect(a.id)}
          >
            <span className="stack-xs">
              <span className="roster-row__name">{a.name}</span>
              <span className="small muted">
                {a.sport} &middot; {a.injury}
              </span>
              {flags.length > 0 && <span className="small strong warn-text">{flags.join(' · ')}</span>}
            </span>
            <span className="roster-row__stats">
              <span className="small">
                {doneOnDay(a, state.logs, now)}/{a.assignedExerciseIds.length} today &middot; {week}% week
              </span>
              <span className={status === 'Behind' ? 'small strong warn-text' : 'small strong'}>{status}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
