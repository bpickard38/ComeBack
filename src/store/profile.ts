/*
  Who is signed in: their name and role from the users table, and which teams
  they're on (team_members). The role was picked at sign-up and decides which
  screens they see; the teams decide whose data they can see.
*/
import type { Role } from '../domain/types';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  name: string;
  role: Role;
  teamIds: string[];
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  const [user, teams] = await Promise.all([
    supabase.from('users').select('name, role').eq('id', userId).maybeSingle(),
    supabase.from('team_members').select('team_id').eq('user_id', userId),
  ]);
  if (user.error) throw user.error;
  if (teams.error) throw teams.error;
  if (!user.data) return null;
  return {
    id: userId,
    name: user.data.name,
    role: user.data.role as Role,
    teamIds: teams.data.map((t) => t.team_id as string),
  };
}
