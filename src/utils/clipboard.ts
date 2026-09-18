/**
 * Cross-browser clipboard copy with fallback for mobile / iframe contexts
 * where navigator.clipboard.writeText may be blocked or hang.
 */

function fallbackCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Prevent scrolling on iOS
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    // iOS Safari requires setSelectionRange
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Try modern Clipboard API with a timeout (some dApp browsers hang)
  if (navigator.clipboard?.writeText) {
    try {
      const result = await Promise.race([
        navigator.clipboard.writeText(text).then(() => true),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (result === true) return true;
      // Timed out — fall through to fallback
    } catch {
      // Blocked by permissions policy — fall through to fallback
    }
  }

  // 2. Fallback: hidden textarea + execCommand
  return fallbackCopy(text);
}
