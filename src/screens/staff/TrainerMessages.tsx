import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { ChatThread } from '../../components/MessageBox';
import { athleteThread, awaitsTrainer, inboxOrder, lastMessage } from '../../domain/messages';
import type { MessageThread } from '../../domain/types';
import { formatSentAt } from '../../format';
import { useAppStore } from '../../store/AppStore';

/** One person the trainer can message. */
interface Contact {
  thread: MessageThread;
  /** What goes in ?with= so a link can open this conversation. */
  param: string;
  name: string;
  /** Second line in the list, e.g. the athlete's sport. */
  detail: string;
}

/**
 * The trainer's direct messages: the coach, then every athlete, on the left;
 * the open conversation on the right. The open one is in the URL
 * (/staff/messages?with=<athlete id> or ?with=coach) so the roster can link
 * straight to it and the back button works.
 */
export function TrainerMessages() {
  const { state } = useAppStore();
  const [params, setParams] = useSearchParams();

  const coach: Contact = { thread: 'coach-trainer', param: 'coach', name: 'Coach', detail: 'Team coach' };
  const byThread = new Map<MessageThread, Contact>(
    state.athletes.map((a) => [
      athleteThread(a.id),
      { thread: athleteThread(a.id), param: a.id, name: a.name, detail: a.sport },
    ]),
  );
  const athletes = inboxOrder([...byThread.keys()], state.messages).map((t) => byThread.get(t)!);

  const all = [coach, ...athletes];
  const open = all.find((c) => c.param === params.get('with')) ?? athletes[0] ?? coach;

  return (
    <>
      <div className="stack-xs">
        <h1>Messages</h1>
        <p className="muted">Direct messages with your athletes and the coach. Athletes and the coach can&rsquo;t see each other&rsquo;s.</p>
      </div>

      <div className="staff-grid">
        <section className="card card--flush" aria-label="Conversations">
          <div className="table-head">
            <span>Coach</span>
          </div>
          <ContactRow contact={coach} selected={open === coach} onSelect={() => setParams({ with: coach.param })} />
          <div className="table-head">
            <span>Athletes</span>
          </div>
          {athletes.length === 0 ? (
            <p className="muted pad">No athletes on the roster yet.</p>
          ) : (
            athletes.map((c) => (
              <ContactRow key={c.param} contact={c} selected={open === c} onSelect={() => setParams({ with: c.param })} />
            ))
          )}
        </section>

        <Card aria-labelledby="chat-name">
          <div className="stack-xs">
            <h2 id="chat-name">{open.name}</h2>
            <p className="small muted">
              {open === coach
                ? 'Only you and the coach see this. Keep medical details out; the coach sees status only.'
                : `Only you and ${open.name} see this.`}
            </p>
          </div>
          {/* key starts a fresh draft when you switch conversations */}
          <ChatThread key={open.thread} thread={open.thread} recipient={open.name} />
        </Card>
      </div>
    </>
  );
}

function ContactRow({ contact, selected, onSelect }: { contact: Contact; selected: boolean; onSelect: () => void }) {
  const { state, profile } = useAppStore();
  const last = lastMessage(state.messages, contact.thread);
  const waiting = awaitsTrainer(state.messages, contact.thread);

  return (
    <button type="button" className="roster-row inbox-row" aria-pressed={selected} onClick={onSelect}>
      <span className="stack-xs">
        <span className="roster-row__name">{contact.name}</span>
        <span className="small muted">
          {contact.detail}
          {last && <> &middot; {formatSentAt(last.sentAt)}</>}
        </span>
        {last && (
          <span className="small inbox-preview">
            {last.senderId === profile.id ? 'You: ' : ''}
            {last.text}
          </span>
        )}
        {waiting && <span className="small strong warn-text">New message</span>}
      </span>
    </button>
  );
}
