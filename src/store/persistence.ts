/*
  Saving to the browser. localStorage keeps text per website, even after a
  refresh. When a real backend arrives, this file is what gets replaced.
*/
import type { AppState } from './state';

// Bump the version when AppState's shape changes, so old saved data is ignored.
const STORAGE_KEY = 'comeback:v3';

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    // Light sanity check; anything odd falls back to fresh demo data.
    if (!Array.isArray(parsed.athletes) || !Array.isArray(parsed.logs)) return null;
    return parsed;
  } catch {
    return null; // storage blocked (private mode) or corrupt JSON
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the app keeps working, it just won't remember.
  }
}
