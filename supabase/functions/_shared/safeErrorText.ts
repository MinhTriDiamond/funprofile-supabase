export function safeErrorText(error: unknown, maxLength = 300): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected provider error';
  return message
    .replace(/https?:\/\/[^\s"'<>)}\]]+/gi, '[redacted-url]')
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi, '$1[redacted]')
    .replace(/(authorization|token|secret|stream.?key|api.?key)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]')
    .slice(0, Math.max(0, maxLength));
}
