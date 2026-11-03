import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { chatItems, messagesIn, unreadIn } from '../domain/messages';
import type { MessageThread } from '../domain/types';
import { formatSentAt, initials } from '../format';
import { useAppStore } from '../store/AppStore';
import { useToast } from './Toast';

/** Round picture stand-in: the person's initials. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`avatar avatar--${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

interface ChatThreadProps {
  thread: MessageThread;
  /** Who you're talking to, e.g. "Maya Torres". */
  name: string;
  /** Small line under the name, e.g. "Soccer" or "Only you two see this". */
  detail?: string;
  /** Shows a back arrow (phones only, see CSS) that calls this. */
  onBack?: () => void;
}

/**
 * A direct-message conversation styled like Instagram: their messages on the
 * left with their initials, yours on the right, back-to-back messages
 * grouped, a timestamp only after a pause, and "Seen" once they've read your
 * last one. Opening it marks the other person's messages as read.
 */
export function ChatThread({ thread, name, detail, onBack }: ChatThreadProps) {
  const { state, commands, profile } = useAppStore();
  const { notify } = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const messages = messagesIn(state.messages, thread);
  const items = chatItems(messages);
  const unread = unreadIn(state.messages, thread, profile.id);
  const last = messages[messages.length - 1];
  const textareaId = `chat-${thread}`;

  // Keep the newest message in view when one arrives or the thread changes.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, thread]);

  // You're looking at it, so anything new from them is now read. If saving
  // that fails, the "New" marker just stays until the next try.
  useEffect(() => {
    if (unread > 0 && document.visibilityState === 'visible') commands.markRead(thread);
    // commands is left out on purpose: it's rebuilt every render.
  }, [unread, thread]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (sending || draft.trim() === '') return;
    setSending(true);
    const result = await commands.sendMessage(thread, draft);
    setSending(false);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    setDraft('');
  }

  // Enter sends, Shift+Enter starts a new line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  return (
    <section className="chat" aria-label={`Conversation with ${name}`}>
      <header className="chat__head">
        {onBack && (
          <button type="button" className="chat__back" onClick={onBack} aria-label="Back to messages">
            &larr;
          </button>
        )}
        <Avatar name={name} />
        <div className="stack-xs chat__who">
          <h2 className="chat__name">{name}</h2>
          {detail && <span className="small muted">{detail}</span>}
        </div>
      </header>

      {/* role="log" tells screen readers new messages are added at the end. */}
      <div ref={logRef} className="chat__log" role="log">
        {messages.length === 0 ? (
          <div className="chat__empty">
            <Avatar name={name} size="lg" />
            <span className="strong">{name}</span>
            <span className="small muted">No messages yet.</span>
          </div>
        ) : (
          items.map(({ message: m, showTime, firstInGroup, lastInGroup }) => {
            const mine = m.senderId === profile.id;
            const sender = mine ? 'You' : (m.senderName ?? m.from);
            const classes = [
              'msg',
              mine ? 'msg--mine' : 'msg--theirs',
              firstInGroup ? 'msg--first' : 'msg--joined-top',
              lastInGroup ? '' : 'msg--joined-bottom',
            ].join(' ');
            return (
              <div key={m.id} className="chat__item">
                {showTime && <div className="chat__time">{formatSentAt(m.sentAt)}</div>}
                <div className={classes}>
                  {/* Their initials sit beside the last bubble of each run, like Instagram. */}
                  {!mine && (lastInGroup ? <Avatar name={sender} size="sm" /> : <span className="avatar-spacer" />)}
                  <div className="msg__bubble" title={formatSentAt(m.sentAt)}>
                    <span className="visually-hidden">{sender}: </span>
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {last && last.senderId === profile.id && (
          <div className="chat__seen">{last.readAt ? 'Seen' : 'Sent'}</div>
        )}
      </div>

      <form className="chat__compose" onSubmit={send}>
        <label htmlFor={textareaId} className="visually-hidden">
          Message {name}
        </label>
        <textarea
          id={textareaId}
          className="chat__input"
          rows={1}
          placeholder="Message…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {/* Like Instagram, Send only appears once there's something to send. */}
        {draft.trim() !== '' && (
          <button type="submit" className="chat__send" disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        )}
      </form>
    </section>
  );
}
