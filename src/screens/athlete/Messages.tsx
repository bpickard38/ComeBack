import { Card } from '../../components/Card';
import { ChatThread } from '../../components/MessageBox';
import { athleteThread } from '../../domain/messages';
import { useSignedInAthlete } from '../../store/AppStore';

/** The athlete's direct messages with their trainer. */
export function Messages() {
  const me = useSignedInAthlete();

  return (
    <Card aria-labelledby="trainer-msgs">
      <div className="stack-xs">
        <h1 id="trainer-msgs" className="title">
          Your trainer
        </h1>
        <p className="small muted">Questions, pain or anything that felt off. Your coach can&rsquo;t see these.</p>
      </div>
      <ChatThread thread={athleteThread(me.id)} recipient="your trainer" />
    </Card>
  );
}
