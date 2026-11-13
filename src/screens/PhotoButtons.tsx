import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { squarePhoto } from '../photo';
import { useAppStore } from '../store/AppStore';

interface PhotoButtonsProps {
  /** Whose photo this is. Leave out for the signed-in person's own. */
  athleteId?: string;
  /** Their name, for the messages a trainer sees. */
  name?: string;
  hasPhoto: boolean;
  /** Smaller buttons, for sitting beside a heading. */
  small?: boolean;
}

/**
 * "Add a photo" / "Change photo" and "Remove". Used by athletes for their
 * own picture and by trainers for an athlete's. The picture is cropped to a
 * square and shrunk before it's uploaded (see src/photo.ts).
 */
export function PhotoButtons({ athleteId, name, hasPhoto, small = false }: PhotoButtonsProps) {
  const { commands } = useAppStore();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const size = small ? 'btn--small' : '';
  const whose = name ? `${name}’s photo` : 'Photo';

  async function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so picking the same file again still fires
    if (!file) return;
    setBusy(true);
    try {
      const result = await commands.setPhoto(await squarePhoto(file), athleteId);
      if (!result.ok) notify(result.error, 'error');
      else notify(name ? `${whose} saved.` : 'Photo saved. Your trainer can see it now.');
    } catch {
      notify('That file isn’t a picture this browser can read. Try a JPEG or PNG.', 'error');
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    const result = await commands.setPhoto(null, athleteId);
    setBusy(false);
    if (!result.ok) notify(result.error, 'error');
    else notify(`${whose} removed.`);
  }

  return (
    <div className="row">
      <Button variant={small ? 'secondary' : 'primary'} className={size} disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? 'Saving…' : hasPhoto ? 'Change photo' : 'Add a photo'}
      </Button>
      {hasPhoto && (
        <Button className={size} disabled={busy} onClick={remove}>
          Remove{small ? ' photo' : ''}
        </Button>
      )}
      {/* The real file picker is hidden; the button above opens it. */}
      <input ref={fileRef} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={picked} />
    </div>
  );
}
