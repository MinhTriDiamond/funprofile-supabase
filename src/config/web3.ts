/**
 * SR-5: Web3 visibility optimization
 *
 * Adds `refetchIntervalInBackground: false` globally to wagmi's internal
 * QueryClient so ALL useReadContract / useBalance calls stop polling
 * when the tab is hidden.
 */

import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  trustWallet,
  bitgetWallet,
  coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { funWallet } from './funWallet';
import { createConfig, createStorage, http } from 'wagmi';
import { mainnet, bsc, bscTestnet, polygon } from 'wagmi/chains';
import { QueryClient } from '@tanstack/react-query';

export const walletConnectProjectId = '21fef48091f12692cad574a6f7753643';
export const walletConnectMetadata = {
  appName: 'FUN Profile',
  appDescription: 'A Web3 social profile for the FUN ecosystem.',
  appUrl: 'https://fun.rich',
  appIcon: 'https://fun.rich/fun-profile-logo.png',
} as const;

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        trustWallet,
        coinbaseWallet,
        bitgetWallet,
        funWallet,
      ],
    },
  ],
  {
    appName: walletConnectMetadata.appName,
    appDescription: walletConnectMetadata.appDescription,
    appUrl: walletConnectMetadata.appUrl,
    appIcon: walletConnectMetadata.appIcon,
    projectId: walletConnectProjectId,
  }
);

// SR-5: Dedicated wagmi QueryClient with background polling disabled globally.
export const wagmiQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15_000,
    },
  },
});

export const config = createConfig({
  connectors,
  chains: [mainnet, bsc, bscTestnet, polygon],
  storage: createStorage({ storage: localStorage }),
  transports: {
    // FIX: viem default mainnet RPC = https://eth.merkle.io which is blocked by CORS
    // from fun.rich origin → floods console with net::ERR_FAILED and starves
    // supabase.auth.signInWithPassword fetch. Use a CORS-friendly public RPC.
    [mainnet.id]: http('https://ethereum-rpc.publicnode.com'),
    [bsc.id]: http('https://bsc-rpc.publicnode.com'),
    [bscTestnet.id]: http('https://data-seed-prebsc-1-s1.binance.org:8545/'),
    [polygon.id]: http('https://polygon-bor-rpc.publicnode.com'),
  },
});
