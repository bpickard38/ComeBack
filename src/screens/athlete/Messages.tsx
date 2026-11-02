import { ChatThread } from '../../components/Chat';
import { athleteThread, messagesIn } from '../../domain/messages';
import { useAppStore, useSignedInAthlete } from '../../store/AppStore';

/** The athlete's direct messages with their trainer. */
export function Messages() {
  const { state } = useAppStore();
  const me = useSignedInAthlete();
  const thread = athleteThread(me.id);
  // Use the trainer's name once they've written; until then, a generic one.
  const trainerName = messagesIn(state.messages, thread).find((m) => m.from === 'Trainer')?.senderName ?? 'Your trainer';

  return (
    <>
      <h1 className="visually-hidden">Messages</h1>
      <ChatThread thread={thread} name={trainerName} detail="Athletic trainer. Your coach can’t see these." />
    </>
  );
}
