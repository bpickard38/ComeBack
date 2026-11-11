/*
  Rules for people on more than one team. A trainer can run several teams;
  the staff screens show one team at a time.
*/
import { athleteThread } from './messages';
import type { Athlete, MessageThread, Team } from './types';

/** One team's coach-to-trainer thread. Every team has its own. */
export function coachThread(teamId: string): MessageThread {
  return `coach:${teamId}`;
}

/** The team being looked at: the chosen one if you're still on it, otherwise the first. */
export function currentTeam(teams: Team[], selectedId: string | null): Team | undefined {
  return teams.find((t) => t.id === selectedId) ?? teams[0];
}

export function athletesOnTeam(athletes: Athlete[], teamId: string): Athlete[] {
  return athletes.filter((a) => a.teamIds.includes(teamId));
}

/** Every conversation a trainer has on one team: its coach thread, then each athlete's. */
export function teamThreads(athletes: Athlete[], teamId: string): MessageThread[] {
  return [coachThread(teamId), ...athletesOnTeam(athletes, teamId).map((a) => athleteThread(a.id))];
}
