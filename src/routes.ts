import type { Role } from './domain/types';

/** Where each role lands after switching or opening the app. */
export function homeFor(role: Role): string {
  return role === 'athlete' ? '/athlete' : '/staff';
}
