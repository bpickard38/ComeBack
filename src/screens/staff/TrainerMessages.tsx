import { useSearchParams } from 'react-router-dom';
import { Avatar, ChatThread } from '../../components/Chat';
import { athleteThread, inboxOrder, lastMessage, unreadIn } from '../../domain/messages';
import type { MessageThread } from '../../domain/types';
import { formatAgo } from '../../format';
import { useAppStore } from '../../store/AppStore';

/** One person the trainer can message. */
interface Contact {
  thread: MessageThread;
  /** What goes in ?with= so a link can open this conversation. */
  param: string;
  name: string;
  /** Line under the name in the chat header. */
  detail: string;
}

/**
 * The trainer's direct messages, laid out like Instagram: the coach and
 * every athlete (most recent first) on the left, the open conversation on
 * the right. On phones it's one or the other, with a back arrow.
 *
 * The open conversation is in the URL (?with=<athlete id> or ?with=coach)
 * so the roster can link straight to it and the back button works. Nothing
 * opens by itself, so visiting this tab doesn't mark anything as read.
 */
export function TrainerMessages() {
  const { state } = useAppStore();
  const [params, setParams] = useSearchParams();

  const coach: Contact = {
    thread: 'coach-trainer',
    param: 'coach',
    name: 'Coach',
    detail: 'Team coach. Keep medical details out; they see status only.',
  };
  const byThread = new Map<MessageThread, Contact>(
    state.athletes.map((a) => [
      athleteThread(a.id),
      { thread: athleteThread(a.id), param: a.id, name: a.name, detail: `${a.sport}. Only you two see this.` },
    ]),
  );
  const athletes = inboxOrder([...byThread.keys()], state.messages).map((t) => byThread.get(t)!);
  const open = [coach, ...athletes].find((c) => c.param === params.get('with'));
  const select = (c: Contact) => setParams({ with: c.param });

  return (
    <>
      <h1>Messages</h1>
      <div className={open ? 'dm dm--open' : 'dm'}>
        <nav className="card card--flush dm__list" aria-label="Conversations">
          <h2 className="dm__section">Coach</h2>
          <ContactRow contact={coach} isOpen={open === coach} onSelect={() => select(coach)} />
          <h2 className="dm__section">Athletes</h2>
          {athletes.length === 0 ? (
            <p className="muted pad">No athletes on the roster yet.</p>
          ) : (
            athletes.map((c) => <ContactRow key={c.param} contact={c} isOpen={open === c} onSelect={() => select(c)} />)
          )}
        </nav>

        <div className="dm__chat">
          {open ? (
            // key starts a fresh draft when you switch conversations
            <ChatThread key={open.thread} thread={open.thread} name={open.name} detail={open.detail} onBack={() => setParams({})} />
          ) : (
            <section className="card dm__placeholder">
              <p className="muted">Choose a conversation.</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** Avatar, name, last message and how long ago; bold with a dot when unread. */
function ContactRow({ contact, isOpen, onSelect }: { contact: Contact; isOpen: boolean; onSelect: () => void }) {
  const { state, profile } = useAppStore();
  const last = lastMessage(state.messages, contact.thread);
  const unread = unreadIn(state.messages, contact.thread, profile.id);

  return (
    <button
      type="button"
      className={unread > 0 ? 'inbox-row inbox-row--unread' : 'inbox-row'}
      aria-current={isOpen}
      onClick={onSelect}
    >
      <Avatar name={contact.name} />
      <span className="inbox-row__text">
        <span className="inbox-row__name">{contact.name}</span>
        <span className="inbox-row__preview">
          {last ? (
            <>
              <span className="inbox-row__snippet">
                {unread > 1 ? `${unread} new messages` : `${last.senderId === profile.id ? 'You: ' : ''}${last.text}`}
              </span>
              <span aria-hidden="true">&middot;</span>
              <span>{formatAgo(last.sentAt)}</span>
            </>
          ) : (
            <span>No messages yet</span>
          )}
        </span>
      </span>
      {unread > 0 && (
        <>
          <span className="unread-dot" aria-hidden="true" />
          <span className="visually-hidden">, unread</span>
        </>
      )}
    </button>
  );
}
