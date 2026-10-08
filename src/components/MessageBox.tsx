import { useState, type FormEvent } from 'react';
import { messagesIn } from '../domain/messages';
import type { Message, MessageThread } from '../domain/types';
import { formatTime } from '../format';
import { useAppStore } from '../store/AppStore';
import { Button } from './Button';
import { useToast } from './Toast';
import { useReturnFocus } from './useReturnFocus';

interface MessageBoxProps {
  thread: MessageThread;
  /** Who you're writing to, e.g. "Maya Torres" or "your trainer". */
  recipient: string;
  /** Heading over the message history. */
  title: string;
}

/**
 * Compose button + form + the conversation so far. Used by all three roles;
 * the store decides who is allowed to write in which thread.
 */
export function MessageBox({ thread, recipient, title }: MessageBoxProps) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const openButtonRef = useReturnFocus(composing);
  const textareaId = `msg-${thread}`;

  function close() {
    setComposing(false);
    setDraft('');
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    const result = await commands.sendMessage(thread, draft);
    setSending(false);
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    close();
    notify(`Message sent to ${recipient}.`);
  }

  return (
    <>
      {composing ? (
        <form className="panel" onSubmit={send}>
          <label htmlFor={textareaId} className="strong">
            To {recipient}
          </label>
          <textarea
            id={textareaId}
            className="field field--area"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="row">
            <Button type="submit" variant="primary" disabled={sending}>
              {sending ? 'Sending…' : 'Send'}
            </Button>
            <Button onClick={close}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button ref={openButtonRef} className="align-start strong" onClick={() => setComposing(true)}>
          Message {recipient}
        </Button>
      )}
      <MessageList title={title} messages={messagesIn(state.messages, thread)} />
    </>
  );
}

/**
 * A titled list of messages, oldest first. Your own show as "You" on grey;
 * everyone else's are pale blue. Renders nothing when empty.
 */
export function MessageList({ title, messages }: { title: string; messages: Message[] }) {
  const { profile } = useAppStore();
  if (messages.length === 0) return null;

  const mine = (m: Message) => m.senderId === profile.id;
  const senderName = (m: Message) => (mine(m) ? 'You' : (m.senderName ?? m.from));

  return (
    <div className="stack-sm">
      <h3 className="label">{title}</h3>
      {messages.map((m) => (
        <div key={m.id} className={mine(m) ? 'bubble' : 'bubble bubble--mist'}>
          <span className="strong">
            {senderName(m)} &middot; {formatTime(m.sentAt)}
          </span>
          <br />
          {m.text}
        </div>
      ))}
    </div>
  );
}
