/*
  Player Pet, saved in the database (supabase/player_pet.sql):
  - athlete_pets: his look and settings, one row per athlete.
  - pet_games: every game he played. A game is saved once and never changes,
    so his record survives plan changes and is the same on every device.

  Only the athlete can read or write these rows; trainers and coaches never
  see the pet. A copy is also kept on this device (localStorage) so the pet
  shows up instantly, and so it still works if the tables haven't been
  created yet.
*/
import { useEffect, useState } from 'react';
import { dayKey } from '../domain/dates';
import { DEFAULT_LOOK, JERSEY_COLORS, SKIN_TONES, type PetGame, type PetLook } from '../domain/pet';
import { supabase } from './supabase';

export interface PetSave {
  enabled: boolean;
  look: PetLook;
  /** The day the pet joined, "YYYY-MM-DD". His first game is that night. */
  startedOn: string;
  /** The last game day whose recap the athlete closed. */
  seenThrough: string | null;
  /** The newest milestone goal he already celebrated (that result's time), so each one is celebrated once. */
  celebratedGoalAt?: string | null;
}

/* ---------- This device's copy ---------- */

const key = (athleteId: string) => `comeback.pet.${athleteId}`;

/** A color from an older version of the app that's no longer offered goes back to the default. */
function cleanLook(saved: Partial<PetLook>): PetLook {
  const look = { ...DEFAULT_LOOK, ...saved };
  if (!JERSEY_COLORS.some((c) => c.value === look.jersey)) look.jersey = DEFAULT_LOOK.jersey;
  if (!SKIN_TONES.some((c) => c.value === look.skin)) look.skin = DEFAULT_LOOK.skin;
  return look;
}

function loadLocal(athleteId: string): PetSave | null {
  // Storage can be blocked (private windows, some settings), so never let it crash the screen.
  try {
    const raw = localStorage.getItem(key(athleteId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as PetSave;
    return { ...saved, look: cleanLook(saved.look) };
  } catch {
    return null;
  }
}

function storeLocal(athleteId: string, save: PetSave) {
  try {
    localStorage.setItem(key(athleteId), JSON.stringify(save));
  } catch {
    // Not saved on this device; the database copy still is.
  }
}

/* ---------- The database ---------- */

interface PetRow {
  enabled: boolean;
  name: string;
  jersey_number: number;
  jersey_color: string;
  skin_tone: string;
  started_on: string;
  seen_through: string | null;
  celebrated_goal_at: string | null;
}

interface GameRow {
  day: string;
  opponent: string;
  energy: number;
  our_score: number;
  their_score: number;
  won: boolean;
  touchdowns: number;
  yards: number;
}

function fromRow(row: PetRow): PetSave {
  return {
    enabled: row.enabled,
    look: cleanLook({ name: row.name, number: row.jersey_number, jersey: row.jersey_color, skin: row.skin_tone }),
    startedOn: row.started_on,
    seenThrough: row.seen_through,
    celebratedGoalAt: row.celebrated_goal_at,
  };
}

function toRow(athleteId: string, save: PetSave) {
  return {
    athlete_id: athleteId,
    enabled: save.enabled,
    name: save.look.name,
    jersey_number: save.look.number,
    jersey_color: save.look.jersey,
    skin_tone: save.look.skin,
    started_on: save.startedOn,
    seen_through: save.seenThrough,
    celebrated_goal_at: save.celebratedGoalAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

const gameFromRow = (g: GameRow): PetGame => ({
  day: g.day,
  opponent: g.opponent,
  energy: g.energy,
  ourScore: g.our_score,
  theirScore: g.their_score,
  won: g.won,
  touchdowns: g.touchdowns,
  yards: g.yards,
});

async function savePet(athleteId: string, save: PetSave) {
  const { error } = await supabase.from('athlete_pets').upsert(toRow(athleteId, save), { onConflict: 'athlete_id' });
  if (error) console.warn('Player Pet not saved to the database:', error.message);
}

export function newPetSave(today: Date): PetSave {
  return { enabled: true, look: DEFAULT_LOOK, startedOn: dayKey(today), seenThrough: null };
}

/**
 * The athlete's pet and the games already saved for him.
 * `save` is null when the pet was never turned on. `ready` is false until the
 * database answered, so the screen doesn't flash the "Turn on" card.
 */
export function usePetSave(athleteId: string) {
  const [save, setSave] = useState<PetSave | null>(() => loadLocal(athleteId));
  const [savedGames, setSavedGames] = useState<PetGame[]>([]);
  const [ready, setReady] = useState(false);
  // False when the pet tables don't exist yet; the pet then lives on this device only.
  const [inDatabase, setInDatabase] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pet, games] = await Promise.all([
        supabase
          .from('athlete_pets')
          .select('enabled, name, jersey_number, jersey_color, skin_tone, started_on, seen_through, celebrated_goal_at')
          .eq('athlete_id', athleteId)
          .maybeSingle(),
        supabase
          .from('pet_games')
          .select('day, opponent, energy, our_score, their_score, won, touchdowns, yards')
          .eq('athlete_id', athleteId)
          .order('day'),
      ]);
      if (cancelled) return;
      if (pet.error || games.error) {
        console.warn('Player Pet tables not found; run supabase/player_pet.sql. Using this device only.');
      } else {
        setInDatabase(true);
        setSavedGames(((games.data ?? []) as GameRow[]).map(gameFromRow));
        if (pet.data) {
          const fromDb = fromRow(pet.data as PetRow);
          setSave(fromDb);
          storeLocal(athleteId, fromDb);
        } else {
          // First time with the database: move a pet made on this device into it.
          const local = loadLocal(athleteId);
          if (local) await savePet(athleteId, local);
        }
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  function update(next: PetSave) {
    setSave(next);
    storeLocal(athleteId, next);
    if (inDatabase) void savePet(athleteId, next);
  }

  /** Stores games he just played. Ones already saved (another device got there first) are left alone. */
  async function recordGames(games: PetGame[]) {
    if (!inDatabase || games.length === 0) return;
    const { error } = await supabase.from('pet_games').upsert(
      games.map((g) => ({
        athlete_id: athleteId,
        day: g.day,
        opponent: g.opponent,
        energy: g.energy,
        our_score: g.ourScore,
        their_score: g.theirScore,
        won: g.won,
        touchdowns: g.touchdowns,
        yards: g.yards,
      })),
      { onConflict: 'athlete_id,day', ignoreDuplicates: true },
    );
    if (error) {
      console.warn('Player Pet games not saved:', error.message);
      return;
    }
    setSavedGames((prev) => [...prev, ...games].sort((a, b) => a.day.localeCompare(b.day)));
  }

  return { save, update, savedGames, recordGames, ready, inDatabase };
}
