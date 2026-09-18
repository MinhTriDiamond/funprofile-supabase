import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDID } from '@/hooks/useDID';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { useMyGuardians } from '@/hooks/useGuardians';
import { useQuests } from '@/hooks/useQuests';

export interface BoostMission {
  key: string;
  label: string;
  description: string;
  tcDelta: number;
  done: boolean;
  cta: { label: string; to?: string; action?: 'open-link-wallet' | 'open-onboarding' | 'open-quests' | 'open-recalc' };
  icon: string; // lucide icon name
}

export interface NextBestAction {
  key: string;
  title: string;
  reason: string;
  ctaLabel: string;
  to?: string;
}

export function useTrustBoostData() {
  const { userId } = useCurrentUser();
  const { data: did } = useDID();
  const { data: trust } = useTrustProfile();
  const { data: guardians = [] } = useMyGuardians();
  const { data: quests = [] } = useQuests();

  return useQuery({
    queryKey: ['trust-boost-data', userId, did?.did_id, trust?.tc, guardians.length, quests.length],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: profile }, { data: links }, { data: walletCount }] = await Promise.all([
        supabase.from('profiles').select('avatar_url, bio, display_name').eq('id', userId!).maybeSingle(),
        did?.did_id
          ? (supabase as any).from('identity_links').select('link_type, verification_state').eq('did_id', did.did_id)
          : Promise.resolve({ data: [] }),
        supabase.from('reactions').select('id', { count: 'exact', head: true }).eq('post_id', userId!).then(() => ({ data: 0 })),
      ]);

      const hasAvatar = !!profile?.avatar_url;
      const hasBio = !!(profile?.bio && profile.bio.length >= 20);
      const hasDisplayName = !!profile?.display_name;
      const hasWallet = (links ?? []).some((l: any) => l.link_type === 'wallet' && l.verification_state === 'verified');
      const activeGuardians = guardians.filter((g: any) => g.status !== 'revoked').length;
      const completedSocialQuests = quests.filter(
        (q: any) => ['DAILY_REACT_5', 'DAILY_COMMENT_3', 'DAILY_GIFT_ANY'].includes(q.code) && !!q.progress?.completed_at
      ).length;

      const missions: BoostMission[] = [
        {
          key: 'avatar',
          label: 'Upload avatar',
          description: 'Tăng nhận diện trong cộng đồng',
          tcDelta: 0.02,
          done: hasAvatar,
          cta: { label: hasAvatar ? 'Đã có' : 'Cập nhật profile', to: `/profile/${userId}` },
          icon: 'UserCircle',
        },
        {
          key: 'bio',
          label: 'Hoàn thiện profile (bio + tên)',
          description: 'Bio ≥ 20 ký tự + tên hiển thị',
          tcDelta: 0.05,
          done: hasBio && hasDisplayName,
          cta: { label: 'Sửa profile', to: `/profile/${userId}` },
          icon: 'FileText',
        },
        {
          key: 'wallet',
          label: 'Liên kết & xác minh ví',
          description: 'Tăng mạnh Verification Strength và On-chain Credibility',
          tcDelta: 0.10,
          done: hasWallet,
          cta: { label: hasWallet ? 'Đã liên kết' : 'Liên kết ví', to: '/wallet' },
          icon: 'Wallet',
        },
        {
          key: 'guardian',
          label: 'Mời ≥ 2 guardian',
          description: 'Mở Recovery + tăng Social Trust',
          tcDelta: 0.05,
          done: activeGuardians >= 2,
          cta: { label: activeGuardians >= 2 ? 'Đã có' : 'Mời guardian', to: '/identity/onboarding' },
          icon: 'Users',
        },
        {
          key: 'social-quests',
          label: 'Hoàn thành 3 quest xã hội/ngày',
          description: 'React, comment, tặng quà',
          tcDelta: 0.04,
          done: completedSocialQuests >= 3,
          cta: { label: 'Làm quest', to: '/quests' },
          icon: 'Sparkles',
        },
        {
          key: 'recalc',
          label: 'Tính lại Trust',
          description: 'Sau khi thay đổi → bấm để cập nhật TC',
          tcDelta: 0,
          done: false,
          cta: { label: 'Tính lại', action: 'open-recalc' },
          icon: 'RefreshCw',
        },
      ];

      // Next best action — ưu tiên cao nhất TC delta chưa làm
      const candidates = missions.filter((m) => !m.done && m.tcDelta > 0);
      candidates.sort((a, b) => b.tcDelta - a.tcDelta);
      const top = candidates[0];

      const next: NextBestAction | null = top
        ? {
            key: top.key,
            title: top.label,
            reason: `+${top.tcDelta.toFixed(2)} TC · ${top.description}`,
            ctaLabel: top.cta.label,
            to: top.cta.to,
          }
        : null;

      return { missions, next, hasWallet, activeGuardians };
    },
  });
}
