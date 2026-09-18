// PPLP v2.5 — Activation Gates (Section IX) + Identity+Trust Layer v1.0 integration
// Quy tắc bật/khoá tính năng theo Light Score + Trust Context + Trust Tier
export type GatedFeature =
  | 'earn_basic'
  | 'earn_advanced'
  | 'referral'
  | 'governance_vote'
  | 'proposal_submit'
  | 'validator';

export type TrustTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export interface PhaseThresholds {
  threshold_earn_basic: number;
  threshold_earn_advanced: number;
  threshold_referral: number;
  threshold_governance: number;
  threshold_proposal: number;
  threshold_validator: number;
  min_tc_for_basic: number;
}

const FEATURE_LABEL: Record<GatedFeature, string> = {
  earn_basic: 'Kiếm LS cơ bản',
  earn_advanced: 'Kiếm LS nâng cao',
  referral: 'Phần thưởng giới thiệu',
  governance_vote: 'Bỏ phiếu governance',
  proposal_submit: 'Gửi đề xuất',
  validator: 'Vai trò validator',
};

// Trust Tier requirement per feature (Identity+Trust Layer v1.0 — XI Activation Matrix)
const TIER_REQUIREMENT: Record<GatedFeature, TrustTier> = {
  earn_basic: 'T1',
  earn_advanced: 'T1',
  referral: 'T2',
  governance_vote: 'T2',
  proposal_submit: 'T3',
  validator: 'T4',
};

const TIER_RANK: Record<TrustTier, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 };

function tierMet(actual: TrustTier, required: TrustTier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

export function checkActivation(
  feature: GatedFeature,
  score: number,
  tc: number,
  thresholds: PhaseThresholds,
  trustTier: TrustTier = 'T1',
): { allowed: boolean; reason?: string; required?: number; requiredTc?: number; requiredTier?: TrustTier } {
  // 1. Trust Tier gate (Identity Layer)
  const requiredTier = TIER_REQUIREMENT[feature];
  if (!tierMet(trustTier, requiredTier)) {
    return {
      allowed: false,
      requiredTier,
      reason: `Cần Trust Tier ≥ ${requiredTier} (hiện ${trustTier})`,
    };
  }

  // 2. Light Score + TC gates
  switch (feature) {
    case 'earn_basic': {
      if (score < thresholds.threshold_earn_basic) {
        return { allowed: false, required: thresholds.threshold_earn_basic, reason: `Cần LS ≥ ${thresholds.threshold_earn_basic}` };
      }
      if (tc < thresholds.min_tc_for_basic) {
        return { allowed: false, requiredTc: thresholds.min_tc_for_basic, reason: `Cần Trust ≥ ${thresholds.min_tc_for_basic}` };
      }
      return { allowed: true };
    }
    case 'earn_advanced':
      return score >= thresholds.threshold_earn_advanced
        ? { allowed: true }
        : { allowed: false, required: thresholds.threshold_earn_advanced, reason: `Cần LS ≥ ${thresholds.threshold_earn_advanced}` };
    case 'referral':
      return score >= thresholds.threshold_referral
        ? { allowed: true }
        : { allowed: false, required: thresholds.threshold_referral, reason: `Cần LS ≥ ${thresholds.threshold_referral}` };
    case 'governance_vote':
      return score >= thresholds.threshold_governance
        ? { allowed: true }
        : { allowed: false, required: thresholds.threshold_governance, reason: `Cần LS ≥ ${thresholds.threshold_governance} để bỏ phiếu` };
    case 'proposal_submit':
      return score >= thresholds.threshold_proposal
        ? { allowed: true }
        : { allowed: false, required: thresholds.threshold_proposal, reason: `Cần LS ≥ ${thresholds.threshold_proposal} để gửi đề xuất` };
    case 'validator':
      return score >= thresholds.threshold_validator
        ? { allowed: true }
        : { allowed: false, required: thresholds.threshold_validator, reason: `Cần LS ≥ ${thresholds.threshold_validator}` };
  }
}

export function featureLabel(f: GatedFeature) {
  return FEATURE_LABEL[f];
}

export function displayLS(rawLS: number): number {
  return 100 * Math.log(1 + Math.max(0, rawLS));
}

export function requiredTierFor(f: GatedFeature): TrustTier {
  return TIER_REQUIREMENT[f];
}
