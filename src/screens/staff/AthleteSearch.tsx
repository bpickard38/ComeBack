import { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchAthletes } from '../../domain/search';
import type { Athlete } from '../../domain/types';
import { injuryLabel, plural } from '../../format';
import { useAppStore, useTeam } from '../../store/AppStore';

/** How many names show under the box at once; typing more narrows it. */
const MAX_RESULTS = 3;

/**
 * Search every athlete on all of the trainer's teams by name. Nothing is
 * listed until the trainer types; then the closest few names show and keep
 * changing with each letter. Picking someone switches to their team and
 * opens their profile.
 *
 * Only shown to a trainer with more than one team: with a single team, the
 * roster's own search already covers everyone.
 */
export function AthleteSearch() {
  const { state, commands } = useAppStore();
  const { team } = useTeam();
  const [query, setQuery] = useState('');

  if (state.role !== 'trainer' || state.teams.length < 2) return null;

  const typed = query.trim();
  const matches = typed ? searchAthletes(state.athletes, typed) : [];
  const shown = matches.slice(0, MAX_RESULTS);
  const teamName = (id: string) => state.teams.find((t) => t.id === id)?.name ?? 'Team';
  // Open them on the team being looked at if they're on it, otherwise their first team.
  const teamFor = (a: Athlete) => (team && a.teamIds.includes(team.id) ? team.id : a.teamIds[0]);

  return (
    <section className="athlete-search" aria-label="Search all athletes">
      <label htmlFor="athlete-search" className="strong nowrap">
        Search all athletes:
      </label>
      <div className="athlete-search__box">
      <input
        id="athlete-search"
        type="search"
        className="field field--slim"
        placeholder={`Search all ${plural(state.teams.length, 'team')}`}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
      />

      {typed && (
        <div className="card card--flush athlete-search__results">
          {shown.map((a) => (
            <Link
              key={a.id}
              to={`/staff/athletes/${a.id}`}
              className="roster-row"
              onClick={() => {
                commands.selectTeam(teamFor(a));
                setQuery('');
              }}
            >
              <span className="stack-xs">
                <span className="roster-row__name">{a.name}</span>
                <span className="small muted">{injuryLabel(a)}</span>
              </span>
              <span className="small strong">{a.teamIds.map(teamName).join(', ')}</span>
            </Link>
          ))}
          {/* Read out by screen readers as the list changes. */}
          <p className="small muted athlete-search__status" role="status">
            {matches.length === 0
              ? `No athletes match "${typed}"`
              : matches.length > MAX_RESULTS
                ? `${matches.length - MAX_RESULTS} more. Keep typing to narrow it down.`
                : matches.length === 1
                  ? '1 match'
                  : `${matches.length} matches`}
          </p>
        </div>
      )}
      </div>
    </section>
  );
}
