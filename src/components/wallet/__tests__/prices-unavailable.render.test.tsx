/**
 * @vitest-environment jsdom
 *
 * Bằng chứng cho #7 (bỏ FALLBACK_PRICES) — nhánh Wallet cần đăng nhập nên
 * không test được bằng Playwright (browser đang signed_out). Thay vào đó render
 * trực tiếp 2 màn:
 *   1. Wallet / Assets  → WalletCard với `pricesUnavailable = true`
 *   2. Wallet / Rewards → ClaimRewardsSection với `camlyPrice = null`
 *
 * Yêu cầu: hiển thị "Chưa có giá", KHÔNG hiện "$0" / "$0.00" / "~$0.00".
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WalletCard } from '@/components/wallet/WalletCard';
import { ClaimRewardsSection } from '@/components/wallet/ClaimRewardsSection';
import type { TokenBalance } from '@/hooks/useTokenBalances';

vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'vi', setLanguage: () => {} }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: () => {} }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));
vi.mock('@/hooks/useWalletSecurity', () => ({ useWalletSecurity: () => ({ isBlacklisted: false, isLoading: false }) }));
vi.mock('@/hooks/usePendingClaims', () => ({ usePendingClaims: () => ({ data: [], isLoading: false }) }));

const tokens: TokenBalance[] = [
  { symbol: 'BNB', name: 'BNB', icon: '', balance: 0.9125, price: 0, usdValue: 0, change24h: 0, isLoading: false, decimals: 18 },
  { symbol: 'USDT', name: 'Tether', icon: '', balance: 3809.1281, price: 0, usdValue: 0, change24h: 0, isLoading: false, decimals: 18 },
];


const noZeroUsd = (text: string) => {
  expect(text).not.toMatch(/\$0(\.0+)?(\s|$|[^0-9])/);
};

describe('#7 — Wallet hiển thị "Chưa có giá" khi token-prices trả 503', () => {
  it('Assets: WalletCard không hiện $0 khi pricesUnavailable', () => {
    const { container } = render(
      <WalletCard
        walletAddress="0x847b000000000000000000000000000000ff62e0"
        walletName="MetaMask"
        tokens={tokens}
        totalUsdValue={0}
        pricesUnavailable
        isTokensLoading={false}
        copied={false}
        isConnected
        onCopy={() => {}}
        onRefresh={() => {}}
        onReceive={() => {}}
        onSend={() => {}}
        onSwap={() => {}}
        onBuy={() => {}}
      />
    );
    expect(screen.getAllByText('Chưa có giá').length).toBeGreaterThan(0);
    noZeroUsd(container.textContent || '');
  });

  it('Rewards: ClaimRewardsSection không hiện ~$0.00 khi camlyPrice = null', () => {
    const { container } = render(
      <ClaimRewardsSection
        claimableReward={250000}
        claimedAmount={100000}
        dailyClaimed={0}
        rewardStats={null}
        camlyPrice={null}
        isConnected
        rewardStatus="approved"
        isLoading={false}
        hasAvatar
        hasCover
        hasTodayPost
        hasFullName
        hasSocialLinks
        accountAgeDays={100}
        onClaimClick={() => {}}
        onConnectClick={() => {}}
      />
    );
    expect(screen.getAllByText('Chưa có giá').length).toBeGreaterThan(0);
    noZeroUsd(container.textContent || '');
  });
});
