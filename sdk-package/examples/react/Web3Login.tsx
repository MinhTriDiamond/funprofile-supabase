/**
 * Web3 Login Example Component
 * 
 * This example shows how to implement Web3 wallet authentication
 * using the Fun Profile SDK with MetaMask or other injected providers.
 * 
 * @example
 * ```tsx
 * import { Web3Login } from './Web3Login';
 * 
 * function App() {
 *   return <Web3Login onSuccess={(user) => console.log('Logged in:', user)} />;
 * }
 * ```
 */

import { useState } from 'react';
import { 
  FunProfileClient, 
  SessionStorageAdapter,
  DOMAINS,
  type FunUser 
} from '@fun-ecosystem/sso-sdk';

// Extend window for ethereum provider
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
      on?: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

interface Web3LoginProps {
  onSuccess?: (user: FunUser) => void;
  onError?: (error: Error) => void;
}

// Initialize SDK client with SessionStorage for wallet security
const funProfile = new FunProfileClient({
  clientId: 'fun_farm_client',
  redirectUri: `${DOMAINS.funFarm}/auth/callback`,
  scopes: ['profile', 'wallet'],
  storage: new SessionStorageAdapter('fun_farm_client'), // SessionStorage for wallet auth
});

export function Web3Login({ onSuccess, onError }: Web3LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  // Check if MetaMask is installed
  const isMetaMaskInstalled = () => {
    return typeof window !== 'undefined' && Boolean(window.ethereum?.isMetaMask);
  };

  // Format wallet address for display
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Connect wallet and authenticate
  const handleWeb3Login = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask or another Web3 wallet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Request wallet connection
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const walletAddress = accounts[0];
      setConnectedAddress(walletAddress);

      // 2. Generate message for signing
      const message = funProfile.generateWeb3Message({
        statement: 'Sign in to Fun Farm with your wallet',
      });

      // 3. Request signature
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, walletAddress],
      }) as string;

      // 4. Authenticate with backend
      const result = await funProfile.authenticateWeb3({
        walletAddress,
        signature,
        message,
      });

      console.log('Web3 Login successful:', result);
      
      if (result.isNewUser) {
        console.log('New user created!');
      }

      onSuccess?.(result.user);
    } catch (err) {
      const error = err as Error;
      
      // Handle user rejection
      if (error.message.includes('User rejected') || 
          error.message.includes('user rejected')) {
        setError('You rejected the signature request');
      } else {
        setError(error.message || 'Failed to authenticate with wallet');
      }
      
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  // Disconnect wallet
  const handleDisconnect = () => {
    setConnectedAddress(null);
    setError(null);
    funProfile.logout();
  };

  return (
    <div className="web3-login">
      <h2>Login with Wallet</h2>

      {error && (
        <div className="error-message" style={{ color: 'red', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!isMetaMaskInstalled() && (
        <div style={{ marginBottom: 16, padding: 12, background: '#fff3cd', borderRadius: 4 }}>
          <p style={{ margin: 0 }}>
            🦊 MetaMask is not installed.{' '}
            <a 
              href="https://metamask.io/download/" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Install MetaMask
            </a>
          </p>
        </div>
      )}

      {connectedAddress ? (
        <div className="connected-state">
          <p>
            Connected: <strong>{formatAddress(connectedAddress)}</strong>
          </p>
          <button
            onClick={handleDisconnect}
            style={{ padding: '8px 16px', background: 'transparent' }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={handleWeb3Login}
          disabled={loading || !isMetaMaskInstalled()}
          style={{ 
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 16,
            cursor: loading ? 'wait' : 'pointer'
          }}
        >
          {loading ? (
            'Connecting...'
          ) : (
            <>
              🦊 Connect with MetaMask
            </>
          )}
        </button>
      )}

      <div style={{ marginTop: 24, fontSize: 14, color: 'gray' }}>
        <h4>How it works:</h4>
        <ol style={{ paddingLeft: 20 }}>
          <li>Click "Connect with MetaMask"</li>
          <li>Approve the connection in your wallet</li>
          <li>Sign the authentication message</li>
          <li>You're logged in!</li>
        </ol>
      </div>
    </div>
  );
}

export default Web3Login;
