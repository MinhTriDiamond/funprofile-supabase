export function sanitizeProfileSearch(value: string): string {
  return value.replace(/[^\p{L}\p{N}_\s.-]/gu, ' ').trim().slice(0, 64);
}
