import type { LiveMessage } from './useLiveMessages';

/** Server IDs identify comments; equal text can still be two intentional comments. */
export function reconcileLiveMessage(current: LiveMessage[], incoming: LiveMessage, optimisticId?: number): LiveMessage[] {
  const pending = optimisticId ?? current.find(message => message.id < 0
    && message.session_id === incoming.session_id && message.user_id === incoming.user_id
    && message.content === incoming.content)?.id;
  const remaining = current.filter(message => message.id !== pending);
  const index = remaining.findIndex(message => String(message.id) === String(incoming.id));
  if (index >= 0) remaining[index] = { ...remaining[index], ...incoming, profile: incoming.profile ?? remaining[index].profile };
  else remaining.push(incoming);
  return remaining.sort((a, b) => a.created_at.localeCompare(b.created_at) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}
