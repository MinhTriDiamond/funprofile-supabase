import { Wallet, getWalletConnectConnector } from '@rainbow-me/rainbowkit';
import funWalletLogo from '@/assets/fun-wallet-logo.gif';

export interface FunWalletOptions {
  projectId: string;
}

const FUN_WALLET_URL = 'https://wallet-fun-rich.lovable.app';

export const funWallet = ({ projectId }: FunWalletOptions): Wallet => ({
  id: 'fun-wallet',
  name: 'FUN Wallet',
  iconUrl: funWalletLogo,
  iconBackground: '#2E7D32',
  downloadUrls: {
    browserExtension: FUN_WALLET_URL,
  },
  // Desktop: redirect to FUN Wallet web app
  desktop: {
    getUri: (uri: string) => {
      return `${FUN_WALLET_URL}/connect?wc_uri=${encodeURIComponent(uri)}`;
    },
  },
  // Mobile: deep link (nếu có mobile app trong tương lai)
  mobile: {
    getUri: (uri: string) => `funwallet://wc?uri=${encodeURIComponent(uri)}`,
  },
  qrCode: {
    getUri: (uri: string) => uri,
    instructions: {
      learnMoreUrl: FUN_WALLET_URL,
      steps: [
        {
          description: 'Mở FUN Wallet tại wallet-fun-rich.lovable.app',
          step: 'install',
          title: 'Mở FUN Wallet',
        },
        {
          description: 'Quét mã QR bằng tính năng WalletConnect trong FUN Wallet',
          step: 'scan',
          title: 'Quét mã QR',
        },
      ],
    },
  },
  createConnector: getWalletConnectConnector({ projectId }),
});
