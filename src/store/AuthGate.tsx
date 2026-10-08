/*
  Nothing in the app shows until someone is signed in and on a team.

  1. Ask Supabase who is signed in (onAuthStateChange tells us now and on
     every later sign-in or sign-out).
  2. Signed out: show the sign-in / create account screen.
  3. Signed in: load their profile (the store then loads their data).
  4. Not on a team yet: trainers create one, athletes and coaches join with
     a code (TeamSetup). Then the app opens, locked to their role.
*/
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { SignIn } from '../screens/SignIn';
import { TeamSetup } from '../screens/TeamSetup';
import { AppStoreProvider } from './AppStore';
import { loadProfile, type Profile } from './profile';
import { supabase } from './supabase';

type Loaded = { userId: string; profile: Profile } | { userId: string; error: string };

export function AuthGate({ children }: { children: ReactNode }) {
  // undefined = still checking, null = signed out, string = signed-in user's id
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0); // bumped to load again

  function reload() {
    setLoaded(null);
    setAttempt((n) => n + 1);
  }

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false; // ignore a slow load if the user changed meanwhile
    loadProfile(userId).then(
      (profile) => {
        if (cancelled) return;
        if (!profile) {
          setLoaded({ userId, error: "Your account isn't set up yet. Sign out and try again in a minute." });
          return;
        }
        setLoaded({ userId, profile });
      },
      (error) => {
        console.error('Loading from Supabase failed', error);
        if (!cancelled) setLoaded({ userId, error: 'Could not load your data. Check your connection and try again.' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  if (userId === null) return <SignIn />;
  if (userId === undefined || loaded?.userId !== userId) return <p className="gate-status">Loading…</p>;

  if ('error' in loaded) {
    return (
      <div className="gate-status">
        <p>{loaded.error}</p>
        <div className="row">
          <Button variant="primary" onClick={reload}>
            Try again
          </Button>
          <Button onClick={() => supabase.auth.signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }

  if (loaded.profile.teamIds.length === 0) return <TeamSetup profile={loaded.profile} onJoined={reload} />;

  // key: a different user gets a brand-new store instead of the last one's state.
  return (
    <AppStoreProvider key={userId} profile={loaded.profile}>
      {children}
    </AppStoreProvider>
  );
}
