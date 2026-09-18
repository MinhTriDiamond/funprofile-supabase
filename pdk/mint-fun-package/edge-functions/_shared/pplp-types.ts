// =============================================
// PPLP Types & Constants - Shared Module
// =============================================

// Action Types across all platforms
export const ACTION_TYPES = {
  // FUN Profile
  POST_CREATE: 'POST_CREATE',
  CONTENT_CREATE: 'CONTENT_CREATE',
  COMMENT_CREATE: 'COMMENT_CREATE',
  SHARE_CONTENT: 'SHARE_CONTENT',
  HELP_COMMUNITY: 'HELP_COMMUNITY',
  MENTOR_HELP: 'MENTOR_HELP',
  IDEA_SUBMIT: 'IDEA_SUBMIT',
  // Angel AI
  QUESTION_ASK: 'QUESTION_ASK',
  FEEDBACK_GIVE: 'FEEDBACK_GIVE',
  VISION_CREATE: 'VISION_CREATE',
  // FUN Charity
  DONATE_SUPPORT: 'DONATE_SUPPORT',
  // FUNLife
  JOURNAL_WRITE: 'JOURNAL_WRITE',
  GRATITUDE_PRACTICE: 'GRATITUDE_PRACTICE',
} as const;

export type ActionType = keyof typeof ACTION_TYPES;

// Base Rewards (Policy v1.0.1)
export const BASE_REWARDS: Record<string, number> = {
  QUESTION_ASK: 50,
  POST_CREATE: 70,
  CONTENT_CREATE: 70,
  COMMENT_CREATE: 40,
  SHARE_CONTENT: 40,
  HELP_COMMUNITY: 120,
  MENTOR_HELP: 150,
  IDEA_SUBMIT: 150,
  JOURNAL_WRITE: 20,
  GRATITUDE_PRACTICE: 20,
  DONATE_SUPPORT: 120,
  FEEDBACK_GIVE: 60,
  VISION_CREATE: 1000,
};

// Platform IDs
export const PLATFORMS = {
  FUN_PROFILE: 'fun_profile',
  ANGEL_AI: 'angel_ai',
  FUN_CHARITY: 'fun_charity',
  FUNLIFE: 'funlife',
  FUN_FARM: 'fun_farm',
  FUN_PLAY: 'fun_play',
} as const;

// 5 Pillars of Light
export const PILLARS = {
  S: { name: 'Service', nameVi: 'Phụng sự sự sống', weight: 0.25 },
  T: { name: 'Truth', nameVi: 'Chân thật minh bạch', weight: 0.20 },
  H: { name: 'Healing', nameVi: 'Chữa lành & yêu thương', weight: 0.20 },
  C: { name: 'Contribution', nameVi: 'Đóng góp bền vững', weight: 0.20 },
  U: { name: 'Unity', nameVi: 'Hợp Nhất', weight: 0.15 },
} as const;

// Score ranges
export const SCORE_RANGES = {
  Q: { min: 0.5, max: 3.0, default: 1.0 },
  I: { min: 0.5, max: 5.0, default: 1.0 },
  K: { min: 0.0, max: 1.0, default: 1.0 },
};

// Global thresholds
export const THRESHOLDS = {
  MIN_LIGHT_SCORE: 50,
  MIN_PILLAR_T: 70,
};

// Distribution tiers
export const DISTRIBUTION_TIERS = [
  { name: 'genesis_community', label: 'Genesis Community Fund', rate: 0.01 },
  { name: 'fun_platform', label: 'FUN Platform', rate: 0.0099 },
  { name: 'fun_partners', label: 'FUN Partners', rate: 0.0098 },
];

// Interfaces
export interface LightAction {
  id: string;
  platform_id: string;
  action_type: string;
  action_type_enum?: string;
  actor_id: string;
  target_id?: string;
  metadata: Record<string, unknown>;
  impact: Record<string, unknown>;
  integrity: Record<string, unknown>;
  evidence_hash?: string;
  canonical_hash?: string;
  policy_version?: string;
  status: 'pending' | 'scored' | 'minted' | 'rejected' | 'expired';
  created_at: string;
}

export interface PPLPScore {
  id: string;
  action_id: string;
  pillar_s: number;
  pillar_t: number;
  pillar_h: number;
  pillar_c: number;
  pillar_u: number;
  light_score: number;
  base_reward: number;
  multiplier_q: number;
  multiplier_i: number;
  multiplier_k: number;
  final_reward: number;
  decision: 'pass' | 'fail' | 'pending';
  decision_reason?: string;
  fail_reasons?: string[];
}

export interface MintRequest {
  id: string;
  action_id: string;
  actor_id: string;
  recipient_address: string;
  amount: number;
  action_hash?: string;
  evidence_hash?: string;
  nonce?: string;
  signature?: string;
  signer_address?: string;
  status: 'pending' | 'signed' | 'minted' | 'rejected' | 'expired';
  tx_hash?: string;
  on_chain_error?: string;
}

export interface FraudSignal {
  actor_id: string;
  signal_type: 'SYBIL' | 'BOT' | 'SPAM' | 'COLLUSION';
  severity: number;
  details: Record<string, unknown>;
  source: string;
}

export interface CascadeDistribution {
  total_reward: number;
  user_amount: number;
  user_percentage: number;
  genesis_amount: number;
  platform_amount: number;
  partners_amount: number;
}

// Calculate cascade distribution
export function calculateCascadeDistribution(totalReward: number): CascadeDistribution {
  let remaining = totalReward;
  const genesis_amount = Math.floor(remaining * 0.01);
  remaining -= genesis_amount;
  const platform_amount = Math.floor(remaining * 0.01);
  remaining -= platform_amount;
  const partners_amount = Math.floor(remaining * 0.01);
  remaining -= partners_amount;
  const user_amount = remaining;

  return {
    total_reward: totalReward,
    user_amount,
    user_percentage: totalReward > 0 ? (user_amount / totalReward) * 100 : 0,
    genesis_amount,
    platform_amount,
    partners_amount,
  };
}
