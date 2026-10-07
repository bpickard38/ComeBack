/*
  Availability is what the coach sees instead of medical details. In college
  athletics, a diagnosis is private health information; coaches usually only
  learn whether an athlete can play and roughly when they'll be back.
*/
import type { Availability } from './types';

export const AVAILABILITY_OPTIONS: Array<{ value: Availability; label: string; meaning: string }> = [
  { value: 'out', label: 'Out', meaning: 'Can’t practice or play' },
  { value: 'limited', label: 'Limited', meaning: 'Practice with limits' },
  { value: 'cleared', label: 'Cleared', meaning: 'Full practice and games' },
];

export function availabilityLabel(value: Availability): string {
  return AVAILABILITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** A cleared athlete has no return date to wait for, so it's dropped. */
export function normalizeAvailability(
  availability: Availability,
  expectedReturn: string | null,
): { availability: Availability; expectedReturn: string | null } {
  return { availability, expectedReturn: availability === 'cleared' ? null : expectedReturn || null };
}
