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

/** A team's trainers and coaches talking about one athlete. The athlete isn't in it. */
export function aboutThread(teamId: string, athleteId: string): MessageThread {
  return `about:${teamId}:${athleteId}`;
}

/**
 * What the trainer calls the coach conversation about one athlete:
 * "Coach Mike - Devon". With no coach on the team yet it's "Coach - Devon",
 * and with several, "Coaches - Devon".
 */
export function coachChatLabel(coachNames: string[], athleteName: string): string {
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? '';
  // Someone who signed up as "Coach Lee" shouldn't become "Coach Coach".
  const coach = coachNames.length === 1 ? first(coachNames[0].replace(/^coach\s+/i, '')) : '';
  const who = coachNames.length > 1 ? 'Coaches' : coach ? `Coach ${coach}` : 'Coach';
  return `${who} - ${first(athleteName)}`;
}

/** The team being looked at: the chosen one if you're still on it, otherwise the first. */
export function currentTeam(teams: Team[], selectedId: string | null): Team | undefined {
  return teams.find((t) => t.id === selectedId) ?? teams[0];
}

export function athletesOnTeam(athletes: Athlete[], teamId: string): Athlete[] {
  return athletes.filter((a) => a.teamIds.includes(teamId));
}

/**
 * Every conversation a trainer has on one team: its coach thread, each
 * athlete's own thread, then the coach threads about each athlete.
 */
export function teamThreads(athletes: Athlete[], teamId: string): MessageThread[] {
  const onTeam = athletesOnTeam(athletes, teamId);
  return [
    coachThread(teamId),
    ...onTeam.map((a) => athleteThread(a.id)),
    ...onTeam.map((a) => aboutThread(teamId, a.id)),
  ];
}
