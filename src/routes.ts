import type { Role } from './domain/types';

/** Where each role lands when opening the app. */
export function homeFor(role: Role): string {
  return role === 'athlete' ? '/athlete' : '/staff';
}
