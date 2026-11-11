/*
  Player Pet settings, saved on this device (localStorage) while we try the
  feature out. Nothing about the pet goes to the database, so trainers and
  coaches never see it. Games aren't saved either: they're worked out from the
  exercise logs (see src/domain/pet.ts).
*/
import { useState } from 'react';
import { dayKey } from '../domain/dates';
import { DEFAULT_LOOK, type PetLook } from '../domain/pet';

export interface PetSave {
  enabled: boolean;
  look: PetLook;
  /** The day the pet joined, "YYYY-MM-DD". His first game is that night. */
  startedOn: string;
  /** The last game day whose recap the athlete closed. */
  seenThrough: string | null;
}

const key = (athleteId: string) => `comeback.pet.${athleteId}`;

function load(athleteId: string): PetSave | null {
  // Storage can be blocked (private windows, some settings), so never let it crash the screen.
  try {
    const raw = localStorage.getItem(key(athleteId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as PetSave;
    return { ...saved, look: { ...DEFAULT_LOOK, ...saved.look } };
  } catch {
    return null;
  }
}

function store(athleteId: string, save: PetSave) {
  try {
    localStorage.setItem(key(athleteId), JSON.stringify(save));
  } catch {
    // Not saved, but the pet still works until the page reloads.
  }
}

export function newPetSave(today: Date): PetSave {
  return { enabled: true, look: DEFAULT_LOOK, startedOn: dayKey(today), seenThrough: null };
}

/** The athlete's pet settings and a function to change them. null means never turned on. */
export function usePetSave(athleteId: string) {
  const [save, setSave] = useState<PetSave | null>(() => load(athleteId));
  function update(next: PetSave) {
    store(athleteId, next);
    setSave(next);
  }
  return [save, update] as const;
}
