/**
 * Rewrite pre-baked gift chat text (stored server-side from sender's perspective:
 * "🎁 {sender} đã tặng bạn {amount} {token}!...") to a viewer-aware line.
 *
 * We keep DB rows untouched (100k+ historic messages) and just re-render at UI time.
 * TODO: future migration should store neutral metadata instead of pre-rendered text.
 */

export interface RewriteInput {
  rawText: string | null | undefined;
  /** Viewer's own username, lowercase-compared with the sender captured in the text. */
  viewerUsername?: string | null;
  /**
   * Optional explicit hint. If provided, overrides the username-match heuristic.
   * Used by MessageBubble where `message.sender_id === currentUserId` is known.
   */
  viewerIsSender?: boolean;
}

export interface RewriteResult {
  /** Single-line preview (no TX line, no CTA), for ConversationList. */
  oneLine: string;
  /** Full multi-line text, for message bubble. */
  full: string;
  /** True when the raw text matched the gift pattern. */
  matched: boolean;
}

// VI: "🎁 angelquangvu đã tặng bạn 30 USDT!..."
// EN: "🎁 angelquangvu sent you 30 USDT!..."
const GIFT_PATTERN =
  /^🎁\s+(\S+)\s+(đã tặng bạn|sent you)\s+([^!\n]+?)(?:!|\n|$)/;

function stripTail(text: string): string {
  // Drop everything from the first newline onward, and any trailing "..." fluff.
  const firstLine = text.split(/\r?\n/)[0] ?? text;
  return firstLine.trim();
}

export function rewriteGiftMessage(input: RewriteInput): RewriteResult {
  const raw = (input.rawText ?? '').trim();
  if (!raw) return { oneLine: '', full: '', matched: false };

  const match = raw.match(GIFT_PATTERN);
  if (!match) {
    return { oneLine: stripTail(raw), full: raw, matched: false };
  }

  const [, senderName, verbPhrase, amountToken] = match;
  const isVi = verbPhrase === 'đã tặng bạn';
  const cleanAmount = amountToken.trim();

  const viewerIsSender =
    typeof input.viewerIsSender === 'boolean'
      ? input.viewerIsSender
      : !!input.viewerUsername &&
        input.viewerUsername.trim().toLowerCase() ===
          senderName.trim().toLowerCase();

  let oneLine: string;
  if (viewerIsSender) {
    oneLine = isVi
      ? `🎁 Bạn đã tặng ${cleanAmount}`
      : `🎁 You sent ${cleanAmount}`;
  } else {
    oneLine = isVi
      ? `🎁 ${senderName} đã tặng bạn ${cleanAmount}`
      : `🎁 ${senderName} sent you ${cleanAmount}`;
  }

  // Rebuild `full` by swapping only the first line; keep any following lines
  // (gift message body, TX line, CTA) intact.
  const rest = raw.slice(match[0].length);
  const full = viewerIsSender
    ? (isVi
        ? `🎁 Bạn đã tặng ${cleanAmount}!`
        : `🎁 You sent ${cleanAmount}!`) + rest
    : raw;

  return { oneLine, full, matched: true };
}
