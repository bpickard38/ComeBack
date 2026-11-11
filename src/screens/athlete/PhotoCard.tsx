import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ProfilePhoto } from '../../components/ProfilePhoto';
import { useToast } from '../../components/Toast';
import { squarePhoto } from '../../photo';
import { useAppStore, useSignedInAthlete } from '../../store/AppStore';

/**
 * The athlete's own profile photo: add one, change it or take it down.
 * Their trainer sees it on their profile. Until they add one, the trainer
 * sees an empty outline.
 */
export function PhotoCard() {
  const { commands } = useAppStore();
  const me = useSignedInAthlete();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so picking the same file again still fires
    if (!file) return;
    setBusy(true);
    try {
      const result = await commands.setPhoto(await squarePhoto(file));
      if (!result.ok) notify(result.error, 'error');
      else notify('Photo saved. Your trainer can see it now.');
    } catch {
      notify('That file isn’t a picture this browser can read. Try a JPEG or PNG.', 'error');
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const result = await commands.setPhoto(null);
    setBusy(false);
    if (!result.ok) notify(result.error, 'error');
    else notify('Photo removed.');
  }

  return (
    <Card aria-labelledby="photo-title">
      <div className="photo-card">
        <ProfilePhoto url={me.photoUrl} size="xl" />
        <div className="stack-sm">
          <div className="stack-xs">
            <h2 id="photo-title" className="title">
              Your profile photo
            </h2>
            <p className="small muted">Your trainer sees this on your profile. It's cropped to a square.</p>
          </div>
          <div className="row">
            <Button variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Saving…' : me.photoUrl ? 'Change photo' : 'Add a photo'}
            </Button>
            {me.photoUrl && (
              <Button disabled={busy} onClick={remove}>
                Remove
              </Button>
            )}
          </div>
          {/* The real file picker is hidden; the button above opens it. */}
          <input ref={fileRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={picked} />
        </div>
      </div>
    </Card>
  );
}
