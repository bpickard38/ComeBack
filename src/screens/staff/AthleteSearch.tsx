import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { searchAthletes } from '../../domain/search';
import type { Athlete } from '../../domain/types';
import { injuryLabel, plural } from '../../format';
import { useAppStore, useTeam } from '../../store/AppStore';

/**
 * Search every athlete on all of the trainer's teams by name. Click into the
 * box to list everyone; type to narrow it down. Picking someone switches to
 * their team and opens their profile.
 *
 * Only shown to a trainer with more than one team: with a single team, the
 * roster's own search already covers everyone.
 */
export function AthleteSearch() {
  const { state, commands } = useAppStore();
  const { team } = useTeam();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  if (state.role !== 'trainer' || state.teams.length < 2) return null;

  const matches = searchAthletes(state.athletes, query);
  const teamName = (id: string) => state.teams.find((t) => t.id === id)?.name ?? 'Team';
  // Open them on the team being looked at if they're on it, otherwise their first team.
  const teamFor = (a: Athlete) => (team && a.teamIds.includes(team.id) ? team.id : a.teamIds[0]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <section className="stack-sm" aria-label="Search all athletes">
      <div className="stack-xs">
        <label htmlFor="athlete-search" className="strong">
          Search all your athletes
        </label>
        <div className="row">
          <input
            id="athlete-search"
            type="search"
            className="field athlete-search__field"
            placeholder={`Name, across ${plural(state.teams.length, 'team')}`}
            autoComplete="off"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => e.key === 'Escape' && close()}
          />
          {open && <Button onClick={close}>Close</Button>}
        </div>
      </div>

      {open && (
        <div className="card card--flush">
          {/* Read out by screen readers as the list changes. */}
          <p className="table-head" role="status">
            {matches.length === 0
              ? `No athletes match "${query.trim()}"`
              : query.trim() === ''
                ? `All ${plural(matches.length, 'athlete')} on your teams`
                : `${plural(matches.length, 'athlete')} found`}
          </p>
          {matches.map((a) => (
            <Link
              key={a.id}
              to={`/staff/athletes/${a.id}`}
              className="roster-row"
              onClick={() => {
                commands.selectTeam(teamFor(a));
                close();
              }}
            >
              <span className="stack-xs">
                <span className="roster-row__name">{a.name}</span>
                <span className="small muted">{injuryLabel(a)}</span>
              </span>
              <span className="small strong">{a.teamIds.map(teamName).join(', ')}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
