import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { supabase } from '../store/supabase';

const MIN_PASSWORD = 6;

/** Completes a Supabase invitation after the email link establishes a session. */
export function InviteAccept({ authenticated, email = '' }: { authenticated: boolean; email?: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) {
      setError(`Use a password with at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    // The AuthGate sees the new path and continues to the user's normal home.
    navigate('/', { replace: true });
  }

  if (!authenticated) {
    return (
      <section className="column card invite-accept" aria-labelledby="invite-title">
        <h1 id="invite-title">Invitation link not verified</h1>
        <p>This link did not establish a session. It may have expired or already been used. Ask your administrator to send a new invitation.</p>
        <Button variant="primary" onClick={() => navigate('/', { replace: true })}>Go to sign in</Button>
      </section>
    );
  }

  return (
    <form className="column card invite-accept" onSubmit={submit}>
      <div className="stack-xs">
        <div className="eyebrow">Account invitation</div>
        <h1 id="invite-title">Finish setting up your account</h1>
      </div>
      <label className="label" htmlFor="invite-email">Email</label>
      <input className="field invite-accept__email" id="invite-email" type="email" value={email} readOnly />
      <label className="label" htmlFor="invite-password">Create a password</label>
      <input className="field" id="invite-password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
      <label className="label" htmlFor="invite-confirm-password">Confirm password</label>
      <input className="field" id="invite-confirm-password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
      {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Accept invitation'}</Button>
    </form>
  );
}
