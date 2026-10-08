import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import type { Role } from '../domain/types';
import { supabase } from '../store/supabase';

const ROLES: Array<{ role: Role; label: string }> = [
  { role: 'athlete', label: 'Athlete' },
  { role: 'coach', label: 'Coach' },
  { role: 'trainer', label: 'Athletic trainer' },
];

/** Supabase's minimum unless you change it under Authentication > Providers > Email. */
const MIN_PASSWORD = 6;

/**
 * Sign in, or create an account as an athlete, coach or trainer. The role
 * only picks which screens you see; seeing anyone's data takes a team join
 * code (see TeamSetup and supabase/signup.sql).
 */
export function SignIn() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const signingUp = mode === 'signUp';

  function switchMode() {
    setMode(signingUp ? 'signIn' : 'signUp');
    setError('');
    setNotice('');
  }

  function check(): string {
    if (signingUp && !name.trim()) return 'Enter your name.';
    if (!email.trim() || !password) return 'Enter your email and password.';
    if (signingUp && password.length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters.`;
    if (signingUp && !role) return 'Pick whether you are an athlete, coach or athletic trainer.';
    return '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = check();
    setError(problem);
    setNotice('');
    if (problem) return;

    setBusy(true);
    if (signingUp) {
      // name and role travel as user metadata; the database copies them into
      // the users table when the account is created.
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim(), role } },
      });
      setBusy(false);
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        // Email confirmation is on: no session until they click the link.
        setNotice(`Check ${email.trim()} for a confirmation link, then come back and sign in.`);
        setMode('signIn');
        setPassword('');
      }
      // With a session, AuthGate hears about it and moves on to team setup.
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    // On success AuthGate hears about it and swaps this screen for the app.
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  }

  return (
    <main className="main">
      <form className="column card sign-in" onSubmit={submit} noValidate>
        <h1>Comeback</h1>
        <p className="muted">{signingUp ? 'Create your account.' : 'Sign in to continue.'}</p>

        {signingUp && (
          <>
            <label htmlFor="sign-in-name" className="strong">
              Your name
            </label>
            <input
              id="sign-in-name"
              className="field"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </>
        )}

        <label htmlFor="sign-in-email" className="strong">
          Email
        </label>
        <input
          id="sign-in-email"
          className="field"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="sign-in-password" className="strong">
          Password
        </label>
        <input
          id="sign-in-password"
          className="field"
          type="password"
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {signingUp && (
          <fieldset className="chip-group">
            <legend className="strong">I am a…</legend>
            <div className="pain-scale">
              {ROLES.map((r) => (
                <label key={r.role} className="pain-option role-option">
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="role"
                    value={r.role}
                    checked={role === r.role}
                    onChange={() => setRole(r.role)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {error && (
          <p className="sign-in__error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="sign-in__notice" role="status">
            {notice}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'One moment…' : signingUp ? 'Create account' : 'Sign in'}
        </Button>
        <Button variant="link" onClick={switchMode}>
          {signingUp ? 'I already have an account' : 'New here? Create an account'}
        </Button>
      </form>
    </main>
  );
}
