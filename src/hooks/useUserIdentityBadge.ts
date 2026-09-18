import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lấy DID + Trust Tier + KYC badge cho bất kỳ user_id nào (public).
 * Dùng để hiển thị badge trên ProfileHeader, PostFooter, etc.
 */
export interface UserIdentityBadgeData {
  did_id?: string;
  did_level?: string;
  did_status?: string;
  trust_tier?: string;
  tc?: number;
  sybil_risk?: string;
  // Phase B — KYC cache (chỉ hiển thị, không ảnh hưởng Trust/Tier/SBT)
  identity_verified?: boolean;
  identity_is_test?: boolean;
  identity_level?: string | null;
  identity_verified_at?: string | null;
  // Phase B Hardening — cờ rủi ro doc mismatch (read-only)
  kyc_doc_mismatch?: boolean;
  kyc_risk_flag?: string | null;
}

export function useUserIdentityBadge(userId?: string | null) {
  return useQuery<UserIdentityBadgeData | null>({
    queryKey: ['user-identity-badge', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) return null;

      const [{ data: did }, { data: prof }] = await Promise.all([
        (supabase as any)
          .from('did_registry')
          .select('did_id, did_level, status')
          .eq('owner_user_id', userId)
          .maybeSingle(),
        (supabase as any)
          .from('profiles')
          .select('identity_verified, identity_is_test, identity_level, identity_verified_at')
          .eq('id', userId)
          .maybeSingle(),
      ]);

      let trust: any = null;
      if (did?.did_id) {
        const { data: t } = await (supabase as any)
          .from('trust_profile')
          .select('trust_tier, tc, sybil_risk')
          .eq('did_id', did.did_id)
          .maybeSingle();
        trust = t;
      }

      // Đọc cờ doc_mismatch / kyc_risk_flag nếu user đã có verification.
      // Chỉ query khi profile đang verified để tránh round-trip thừa.
      let docMismatch = false;
      let riskFlag: string | null = null;
      if (prof?.identity_verified) {
        const { data: ver } = await (supabase as any)
          .from('identity_verifications')
          .select('doc_mismatch, kyc_risk_flag')
          .eq('user_id', userId)
          .eq('provider', 'sumsub')
          .maybeSingle();
        docMismatch = !!ver?.doc_mismatch;
        riskFlag = ver?.kyc_risk_flag ?? null;
      }

      if (!did?.did_id && !prof?.identity_verified) return null;

      return {
        did_id: did?.did_id,
        did_level: did?.did_level,
        did_status: did?.status,
        trust_tier: trust?.trust_tier,
        tc: trust?.tc != null ? Number(trust.tc) : undefined,
        sybil_risk: trust?.sybil_risk,
        identity_verified: !!prof?.identity_verified,
        identity_is_test: !!prof?.identity_is_test,
        identity_level: prof?.identity_level ?? null,
        identity_verified_at: prof?.identity_verified_at ?? null,
        kyc_doc_mismatch: docMismatch,
        kyc_risk_flag: riskFlag,
      };
    },
  });
}
