import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { config } from '@/config/web3';
import { ActiveAccountProvider } from '@/contexts/ActiveAccountContext';
import { useWalletVisibilityRefresh } from '@/hooks/useWalletVisibilityRefresh';

interface Web3ProviderProps {
  children: React.ReactNode;
}

function WalletVisibilityBridge() {
  // Tự re-check linkedWalletAddress + reconnect wagmi khi user quay về Fun.Rich.
  useWalletVisibilityRefresh();
  return null;
}

export const Web3Provider = ({ children }: Web3ProviderProps) => {
  return (
    <WagmiProvider config={config} reconnectOnMount={true}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: '#10b981',
          accentColorForeground: 'white',
          borderRadius: 'large',
        })}
      >
        <ActiveAccountProvider>
          <WalletVisibilityBridge />
          {children}
        </ActiveAccountProvider>
      </RainbowKitProvider>
    </WagmiProvider>
  );
};

