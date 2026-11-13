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
import { useLocation } from 'react-router-dom';
import { Button } from '../components/Button';
import { InviteAccept } from '../screens/InviteAccept';
import { SignIn } from '../screens/SignIn';
import { TeamSetup } from '../screens/TeamSetup';
import { clearPendingJoin, pendingJoin } from './pendingJoin';
import { AppStoreProvider } from './AppStore';
import { loadProfile, type Profile } from './profile';
import { supabase } from './supabase';

type Loaded = { userId: string; profile: Profile } | { userId: string; error: string };

interface JoinNotice {
  ok: boolean;
  text: string;
}

// One attempt per sign-in, even if the effect below runs twice (React does
// that in development): both runs wait on the same request.
const inviteAttempts = new Map<string, Promise<JoinNotice | null>>();

/** Joins the team from a link opened before signing in, if there is one. */
function redeemInvite(userId: string): Promise<JoinNotice | null> {
  const invite = pendingJoin();
  if (!invite) return inviteAttempts.get(userId) ?? Promise.resolve(null);
  clearPendingJoin();
  const attempt = Promise.resolve(supabase.rpc('join_team', { p_code: invite.code })).then(
    ({ error }): JoinNotice =>
      error
        ? { ok: false, text: `That join link didn't work. ${error.message}` }
        : { ok: true, text: "You're on the team. The join link added you." },
    (): JoinNotice => ({ ok: false, text: "That join link didn't work. Check your connection and open it again." }),
  );
  inviteAttempts.set(userId, attempt);
  return attempt;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isInvitePath = location.pathname === '/invite';
  // undefined = still checking, null = signed out, string = signed-in user's id
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0); // bumped to load again
  // What happened to a join link they followed, shown once.
  const [joinNotice, setJoinNotice] = useState<JoinNotice | null>(null);

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
    // A join link they opened before signing in is used first, so the team is there when the profile loads.
    redeemInvite(userId)
      .then((joined) => {
        if (!cancelled && joined) {
          setJoinNotice(joined);
          inviteAttempts.delete(userId); // delivered; a later reload shouldn't show it again
        }
        return loadProfile(userId);
      })
      .then(
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

  if (userId === null) return isInvitePath ? <InviteAccept authenticated={false} /> : <SignIn />;
  if (userId === undefined || loaded?.userId !== userId) {
    return <p className="gate-status" role="status" aria-live="polite">Loading…</p>;
  }

  if ('error' in loaded) {
    return (
      <div className="gate-status" role="alert">
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

  // Invite links return here after Supabase verifies them. Let invited users
  // choose their password before team setup or the regular role home takes over.
  if (isInvitePath) return <InviteAccept authenticated email={loaded.profile.email} />;

  if (loaded.profile.role !== 'admin' && loaded.profile.teamIds.length === 0) {
    return <TeamSetup profile={loaded.profile} onJoined={reload} problem={joinNotice?.ok === false ? joinNotice.text : undefined} />;
  }

  // key: a different user gets a brand-new store instead of the last one's state.
  return (
    <AppStoreProvider key={userId} profile={loaded.profile}>
      {joinNotice && (
        <div className={joinNotice.ok ? 'notice join-notice' : 'notice join-notice join-notice--problem'} role={joinNotice.ok ? 'status' : 'alert'}>
          <span>{joinNotice.text}</span>
          <Button onClick={() => setJoinNotice(null)}>Dismiss</Button>
        </div>
      )}
      {children}
    </AppStoreProvider>
  );
}
