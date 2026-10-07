import type { Message, MessageThread } from './types';

/** The thread between the trainer and one athlete. */
export function athleteThread(athleteId: string): MessageThread {
  return `athlete:${athleteId}`;
}

export function messagesIn(messages: Message[], thread: MessageThread): Message[] {
  return messages.filter((m) => m.thread === thread);
}

/** True when the athlete wrote last, so the trainer owes them a reply. */
export function needsReply(messages: Message[], athleteId: string): boolean {
  const thread = messagesIn(messages, athleteThread(athleteId));
  return thread.length > 0 && thread[thread.length - 1].from === 'Athlete';
}
