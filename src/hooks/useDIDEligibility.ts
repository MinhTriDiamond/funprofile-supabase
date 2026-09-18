import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from './useDID';
import { useTrustProfile } from './useTrustProfile';
import { useUserSBTs } from './useUserSBTs';

type Level = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
const RANK: Record<Level, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

export interface EligibilityCheck {
  level: Level;
  achieved: boolean;
  requirements: { label: string; met: boolean }[];
}

/**
 * Tính eligibility cho từng cấp dựa trên client-side data (cache).
 * Match logic của edge function identity-did-auto-promote.
 */
export function useDIDEligibility() {
  const { data: did } = useDID();
  const { data: trust } = useTrustProfile();
  const { data: sbts = [] } = useUserSBTs();

  return useQuery({
    queryKey: ['did-eligibility', did?.did_id, trust?.tc, sbts.length],
    enabled: !!did?.did_id,
    queryFn: async (): Promise<EligibilityCheck[]> => {
      const tc = Number(trust?.tc ?? 0);
      const sybil = trust?.sybil_risk ?? 'medium';
      const sbtActive = sbts.filter((s: any) => s.status === 'active').length;
      const hasHighSbt = sbts.some((s: any) =>
        s.status === 'active' && (s.sbt_category === 'legacy' || s.sbt_category === 'contribution')
      );

      // Links + age
      const { data: links } = await (supabase as any)
        .from('identity_links').select('link_type, verification_state').eq('did_id', did!.did_id);
      const hasWallet = (links ?? []).some((l: any) => l.link_type === 'wallet' && l.verification_state === 'verified');

      const { data: profile } = await (supabase as any)
        .from('profiles').select('created_at').eq('id', did!.owner_user_id).maybeSingle();
      const ageDays = profile?.created_at ? (Date.now() - new Date(profile.created_at).getTime()) / 86400000 : 0;
      const { data: privateRows } = await (supabase as any).rpc('get_my_profile_private');
      const privateRow = Array.isArray(privateRows) ? privateRows[0] : privateRows;
      const hasEmail = !!privateRow?.email;

      const current = (did?.did_level ?? 'L0') as Level;
      const currentRank = RANK[current];

      const checks: EligibilityCheck[] = [
        {
          level: 'L1',
          achieved: currentRank >= 1,
          requirements: [{ label: 'Có email xác thực', met: hasEmail }],
        },
        {
          level: 'L2',
          achieved: currentRank >= 2,
          requirements: [
            { label: 'Đạt L1', met: currentRank >= 1 },
            { label: 'Wallet đã liên kết & xác minh', met: hasWallet },
            { label: `TC ≥ 0.80 (hiện ${tc.toFixed(2)})`, met: tc >= 0.8 },
          ],
        },
        {
          level: 'L3',
          achieved: currentRank >= 3,
          requirements: [
            { label: 'Đạt L2', met: currentRank >= 2 },
            { label: `TC ≥ 1.00 (hiện ${tc.toFixed(2)})`, met: tc >= 1.0 },
            { label: `≥ 3 SBT active (hiện ${sbtActive})`, met: sbtActive >= 3 },
            { label: `Tuổi tài khoản ≥ 30 ngày (hiện ${Math.floor(ageDays)}d)`, met: ageDays >= 30 },
            { label: 'Sybil risk = low', met: sybil === 'low' },
          ],
        },
        {
          level: 'L4',
          achieved: currentRank >= 4,
          requirements: [
            { label: 'Đạt L3', met: currentRank >= 3 },
            { label: `TC ≥ 1.25 (hiện ${tc.toFixed(2)})`, met: tc >= 1.25 },
            { label: 'Có SBT category Legacy hoặc Contribution', met: hasHighSbt },
            { label: 'Cần governance phê duyệt thủ công', met: false },
          ],
        },
      ];

      return checks;
    },
    staleTime: 60_000,
  });
}
