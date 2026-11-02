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

/** True when the athlete or coach wrote last, so the trainer owes them a reply. */
export function awaitsTrainer(messages: Message[], thread: MessageThread): boolean {
  const last = lastMessage(messages, thread);
  return last !== undefined && last.from !== 'Trainer';
}

/** True when the athlete wrote last, so the trainer owes them a reply. */
export function needsReply(messages: Message[], athleteId: string): boolean {
  return awaitsTrainer(messages, athleteThread(athleteId));
}

/**
 * Orders the trainer's inbox: threads waiting on a reply first, then the
 * most recently active, then threads nobody has written in yet (in the
 * order given). Returns a new array.
 */
export function inboxOrder(threads: MessageThread[], messages: Message[]): MessageThread[] {
  const key = (t: MessageThread) => ({
    waiting: awaitsTrainer(messages, t),
    sentAt: lastMessage(messages, t)?.sentAt ?? '',
  });
  // sort is stable, so ties keep their original order.
  return [...threads].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka.waiting !== kb.waiting) return ka.waiting ? -1 : 1;
    // ISO strings sort in time order; '' (no messages) lands last.
    return kb.sentAt.localeCompare(ka.sentAt);
  });
}
