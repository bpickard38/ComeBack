import { Card } from '../../components/Card';
import { ProfilePhoto } from '../../components/ProfilePhoto';
import { useSignedInAthlete } from '../../store/AppStore';
import { PhotoButtons } from '../PhotoButtons';

/**
 * The athlete's own profile photo: add one, change it or take it down.
 * Their trainer sees it on their profile (and can change it too). Until
 * there is one, the trainer sees an empty outline.
 */
export function PhotoCard() {
  const me = useSignedInAthlete();

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
          <PhotoButtons hasPhoto={Boolean(me.photoUrl)} />
        </div>
      </div>
    </Card>
  );
}
