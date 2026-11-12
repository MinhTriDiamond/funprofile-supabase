/** A slow wallet response is not cancellation: it can still broadcast a transfer. */
export async function waitForWalletBroadcast<T>(promise: Promise<T>, slowAfterMs: number, onSlow: () => void): Promise<T> {
  const timer = setTimeout(onSlow, slowAfterMs);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}
