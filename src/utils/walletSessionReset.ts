/**
 * Wallet Session Reset Utilities
 * Clear localStorage, full disconnect, switch wallet account
 */

const WALLET_CONNECT_KEYS = ['wc@2:', 'wagmi.', '-walletlink', 'WALLETCONNECT'];

export function clearWalletLocalStorage() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && WALLET_CONNECT_KEYS.some(prefix => key.startsWith(prefix) || key.includes(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    // ignore in private mode
  }
}

export async function fullWalletDisconnect(disconnectFn: () => void) {
  try {
    disconnectFn();
  } catch {
    // ignore
  }
  clearWalletLocalStorage();
}

export async function requestWalletSwitch(
  currentAddress: string | null,
): Promise<{ switched: boolean; cancelled: boolean; fallbackUsed: boolean }> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    return { switched: false, cancelled: false, fallbackUsed: true };
  }

  try {
    await (window as any).ethereum.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });

    // Check if address actually changed
    const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
    const newAddress = Array.isArray(accounts) ? accounts[0]?.toLowerCase() : null;
    const switched = Boolean(newAddress && newAddress !== currentAddress?.toLowerCase());
    return { switched, cancelled: false, fallbackUsed: false };
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 4001) {
      return { switched: false, cancelled: true, fallbackUsed: false };
    }
    // Fallback for wallets that don't support wallet_requestPermissions
    return { switched: false, cancelled: false, fallbackUsed: true };
  }
}
