/**
 * Mobile Wallet Connect Utilities
 * Deep linking, dApp browser detection, injected provider helpers
 * Supports: MetaMask, Trust Wallet, Bitget Wallet
 */

import { bsc, mainnet } from 'wagmi/chains';

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isBitKeep?: boolean;
  isBitget?: boolean;
};

const bscRpcUrl = (import.meta.env.VITE_BSC_RPC_URL || 'https://bsc-dataseed.binance.org').trim();

export const SUPPORTED_CHAIN_IDS = [bsc.id, 97, mainnet.id] as const;

const CHAIN_PARAMS: Record<number, { chainIdHex: string; chainName: string; rpcUrls: string[]; blockExplorerUrls: string[] }> = {
  56: {
    chainIdHex: '0x38',
    chainName: 'BNB Smart Chain',
    rpcUrls: [bscRpcUrl],
    blockExplorerUrls: ['https://bscscan.com'],
  },
  97: {
    chainIdHex: '0x61',
    chainName: 'BNB Smart Chain Testnet',
    rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
    blockExplorerUrls: ['https://testnet.bscscan.com'],
  },
};

// ─── Device / Browser Detection ───

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isInjectedAvailable(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
}

export function isMetaMaskMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as any).ethereum;
  return Boolean(eth?.isMetaMask) && isMobileDevice();
}

export function isTrustWalletMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as any).ethereum;
  return Boolean(eth?.isTrust || eth?.isTrustWallet) && isMobileDevice();
}

export function isBitgetMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const eth = (window as any).ethereum;
  return Boolean(eth?.isBitKeep || eth?.isBitget) && isMobileDevice();
}

export function isInjectedMobileBrowser(): boolean {
  return isMetaMaskMobileBrowser() || isTrustWalletMobileBrowser() || isBitgetMobileBrowser();
}

export function getInjectedMobileBrowserType(): 'metamask' | 'trustwallet' | 'bitget' | 'unknown' {
  const provider = getInjectedProvider();
  if (!provider) return 'unknown';
  if (provider.isMetaMask) return 'metamask';
  if (provider.isTrust || provider.isTrustWallet) return 'trustwallet';
  if (provider.isBitKeep || provider.isBitget) return 'bitget';
  return 'unknown';
}

// ─── Provider ───

export function getInjectedProvider(): Eip1193Provider | null {
  if (!isInjectedAvailable()) return null;
  return (window as any).ethereum as Eip1193Provider;
}

export async function getInjectedAccounts(provider?: Eip1193Provider | null): Promise<string[]> {
  const eth = provider ?? getInjectedProvider();
  if (!eth) return [];
  try {
    const accounts = await eth.request({ method: 'eth_accounts' });
    return Array.isArray(accounts) ? (accounts as string[]) : [];
  } catch {
    return [];
  }
}

export async function requestInjectedAccounts(provider?: Eip1193Provider | null): Promise<string[]> {
  const eth = provider ?? getInjectedProvider();
  if (!eth) return [];
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  return Array.isArray(accounts) ? (accounts as string[]) : [];
}

// ─── Chain Helpers ───

export function normalizeChainId(rawChainId: unknown): number | null {
  if (typeof rawChainId === 'number' && Number.isFinite(rawChainId)) return rawChainId;
  if (typeof rawChainId !== 'string') return null;
  const value = rawChainId.trim();
  if (!value) return null;
  if (value.startsWith('0x') || value.startsWith('0X')) {
    const parsed = Number.parseInt(value, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isSupportedChain(chainId: number | null | undefined): boolean {
  if (!chainId) return false;
  return SUPPORTED_CHAIN_IDS.includes(chainId as (typeof SUPPORTED_CHAIN_IDS)[number]);
}

export function getChainName(chainId: number | null | undefined): string {
  if (!chainId) return 'Unknown';
  const names: Record<number, string> = {
    1: 'Ethereum', 56: 'BNB Smart Chain', 97: 'BSC Testnet',
    137: 'Polygon', 43114: 'Avalanche', 42161: 'Arbitrum', 10: 'Optimism',
  };
  return names[chainId] || `Chain ${chainId}`;
}

async function switchToChain(provider: Eip1193Provider, targetChainId: number): Promise<boolean> {
  const chainConfig = CHAIN_PARAMS[targetChainId] || CHAIN_PARAMS[bsc.id];
  const chainIdHex = chainConfig?.chainIdHex || `0x${targetChainId.toString(16)}`;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
    return true;
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902) return false;
  }
  try {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIdHex,
        chainName: chainConfig.chainName,
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        rpcUrls: chainConfig.rpcUrls,
        blockExplorerUrls: chainConfig.blockExplorerUrls,
      }],
    });
    return true;
  } catch {
    return false;
  }
}

type EnsureBscParams = { provider?: Eip1193Provider | null; preferredChainId?: number };

export async function ensureBscNetwork(params: EnsureBscParams): Promise<{ ok: boolean; chainId: number | null; error?: string }> {
  const provider = params.provider;
  const preferredChainId = params.preferredChainId ?? bsc.id;
  if (!provider) return { ok: false, chainId: null, error: 'Wallet provider not available' };

  const currentRaw = await provider.request({ method: 'eth_chainId' });
  const currentChainId = normalizeChainId(currentRaw);
  if (isSupportedChain(currentChainId)) return { ok: true, chainId: currentChainId };

  const switched = await switchToChain(provider, preferredChainId);
  if (!switched) return { ok: false, chainId: currentChainId, error: 'Failed to switch chain' };

  const latestRaw = await provider.request({ method: 'eth_chainId' });
  const latestChainId = normalizeChainId(latestRaw);
  if (!isSupportedChain(latestChainId)) return { ok: false, chainId: latestChainId, error: 'Switched chain is still unsupported' };
  return { ok: true, chainId: latestChainId };
}

// ─── Deep Links ───

function getCurrentDappUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function getMetaMaskDeepLink(): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(getCurrentDappUrl());
  return `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}${url.hash}`;
}

export function getTrustWalletDeepLink(): string {
  if (typeof window === 'undefined') return '';
  const url = encodeURIComponent(getCurrentDappUrl());
  return `https://link.trustwallet.com/open_url?coin_id=20000714&url=${url}`;
}

export function getBitgetDeepLink(): string {
  if (typeof window === 'undefined') return '';
  const url = encodeURIComponent(getCurrentDappUrl());
  return `https://bkcode.vip/kLine?url=${url}`;
}

export function getWalletAppLinks() {
  return {
    metamask: {
      android: 'https://play.google.com/store/apps/details?id=io.metamask',
      ios: 'https://apps.apple.com/app/metamask/id1438144202',
    },
    trustWallet: {
      android: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
      ios: 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409',
    },
    bitget: {
      android: 'https://play.google.com/store/apps/details?id=com.bitget.wallet',
      ios: 'https://apps.apple.com/app/bitget-wallet-formerly-bitkeep/id1395301bindung',
    },
  };
}
