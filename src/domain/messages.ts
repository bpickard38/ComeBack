import type { Message, MessageThread } from './types';

/** The thread between the trainer and one athlete. */
export function athleteThread(athleteId: string): MessageThread {
  return `athlete:${athleteId}`;
}

export function messagesIn(messages: Message[], thread: MessageThread): Message[] {
  return messages.filter((m) => m.thread === thread);
}

/** The newest message in a thread, or undefined if nobody has written yet. */
export function lastMessage(messages: Message[], thread: MessageThread): Message | undefined {
  const inThread = messagesIn(messages, thread);
  return inThread[inThread.length - 1];
}

/** How many messages someone else sent you in this thread that you haven't opened. */
export function unreadIn(messages: Message[], thread: MessageThread, readerId: string): number {
  return messagesIn(messages, thread).filter((m) => m.senderId !== readerId && !m.readAt).length;
}

/**
 * Orders an inbox like Instagram: most recent conversation first, then
 * threads nobody has written in yet (in the order given). Returns a new array.
 */
export function inboxOrder(threads: MessageThread[], messages: Message[]): MessageThread[] {
  const sentAt = (t: MessageThread) => lastMessage(messages, t)?.sentAt ?? '';
  // ISO strings sort in time order; '' (no messages) lands last. sort is
  // stable, so ties keep their original order.
  return [...threads].sort((a, b) => sentAt(b).localeCompare(sentAt(a)));
}

/** A pause this long between messages gets a new timestamp above it. */
export const TIME_GAP_MINUTES = 15;

/** One message on the chat screen, with what to draw around it. */
export interface ChatItem {
  message: Message;
  /** Show a centered timestamp above (first message, or after a pause). */
  showTime: boolean;
  /** First and last in a run from the same person, for the bubble corners and avatar. */
  firstInGroup: boolean;
  lastInGroup: boolean;
}

/**
 * Groups a thread the way messaging apps do: back-to-back messages from one
 * person sit together, and a timestamp appears only after a pause.
 */
export function chatItems(thread: Message[]): ChatItem[] {
  const gapMs = TIME_GAP_MINUTES * 60_000;
  const timeBreak = (i: number) =>
    i === 0 || new Date(thread[i].sentAt).getTime() - new Date(thread[i - 1].sentAt).getTime() >= gapMs;
  const sameRun = (a: Message, b: Message) => (a.senderId ?? a.from) === (b.senderId ?? b.from);

  return thread.map((message, i) => {
    const showTime = timeBreak(i);
    const prev = thread[i - 1];
    const next = thread[i + 1];
    return {
      message,
      showTime,
      firstInGroup: showTime || !sameRun(prev, message),
      lastInGroup: !next || timeBreak(i + 1) || !sameRun(message, next),
    };
  });
}
