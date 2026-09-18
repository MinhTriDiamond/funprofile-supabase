// =============================================
// PPLP (Proof of Pure Love Protocol) Configuration
// Updated for On-Chain Minting with lockWithPPLP
// =============================================

export const FUN_MONEY_CONTRACT = {
  address: '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6' as const,
  chainId: 97, // BSC Testnet
  name: 'FUN Money',
  symbol: 'FUN',
  decimals: 18,
};

// =============================================
// GOV-COMMUNITY Multisig: WILL + WISDOM + LOVE
// 9 đại diện cộng đồng, chia 3 nhóm, mỗi nhóm 3 người
// Yêu cầu: 1 chữ ký từ mỗi nhóm → tổng 3 chữ ký
// =============================================

export const GOV_GROUPS = {
  will: {
    name: 'Will',
    nameVi: 'Ý Chí',
    emoji: '💪',
    description: 'Kỹ thuật & Ý chí',
    color: 'blue',
    members: [
      { name: 'Minh Trí',   address: '0xe32d50a0badE4cbD5B0d6120d3A5FD07f63694f1' },
      { name: 'Ánh Nguyệt', address: '0xfd0Da7a744245e7aCECCd786d5a743Ef9291a557' },
      { name: 'Thu Trang',  address: '0x02D5578173bd0DB25462BB32A254Cd4b2E6D9a0D' },
    ],
  },
  wisdom: {
    name: 'Wisdom',
    nameVi: 'Trí Tuệ',
    emoji: '🌟',
    description: 'Tầm nhìn chiến lược',
    color: 'yellow',
    members: [
      { name: 'Bé Giàu', address: '0xCa319fBc39F519822385F2D0a0114B14fa89A301' },
      { name: 'Bé Ngọc', address: '0xDf8249159BB67804D718bc8186f95B75CE5ECbe8' },
      { name: 'Ái Vân',  address: '0x5102Ecc4a458a1af76aFA50d23359a712658a402' },
      { name: 'Minh Trí Test 1', address: '0xE3e97a95d3f61814473f6d1eEbBa8253286D65c5' },
    ],
  },
  love: {
    name: 'Love',
    nameVi: 'Yêu Thương',
    emoji: '❤️',
    description: 'Nhân ái & Chữa lành',
    color: 'rose',
    members: [
      { name: 'Thanh Tiên', address: '0xE418a560611e80E4239F5513D41e583fC9AC2E6d' },
      { name: 'Bé Kim',     address: '0x67464Df3082828b3Cf10C5Cb08FC24A28228EFd1' },
      { name: 'Bé Hà',      address: '0x9ec8C51175526BEbB1D04100256De71CF99B7CCC' },
      { name: 'Minh Trí Test 2', address: '0x57a7943F2808Fc24b0403f25bb4670c5d84b3f2e' },
    ],
  },
} as const;

export type GovGroupKey = keyof typeof GOV_GROUPS;

export interface GovSignature {
  signer: string;
  signature: string;
  signed_at: string;
  signer_name: string | null;
}

export type MultisigSignatures = Partial<Record<GovGroupKey, GovSignature>>;

// Tất cả 9 địa chỉ GOV (cần đăng ký trên contract qua govRegisterAttester)
export const ALL_GOV_ADDRESSES: readonly string[] = Object.values(GOV_GROUPS).flatMap(g => g.members.map(m => m.address));

// Backward compat: ATTESTER_ADDRESSES vẫn trỏ về tất cả 9 địa chỉ
export const ATTESTER_ADDRESSES: readonly string[] = ALL_GOV_ADDRESSES;
export const ATTESTER_ADDRESS = GOV_GROUPS.will.members[0].address; // backward compat

// Tìm nhóm GOV của một địa chỉ ví
export function getGovGroupForAddress(addr: string): GovGroupKey | null {
  for (const [key, group] of Object.entries(GOV_GROUPS)) {
    if (group.members.some(m => m.address.toLowerCase() === addr.toLowerCase())) {
      return key as GovGroupKey;
    }
  }
  return null;
}

// Tìm tên thành viên GOV
export function getGovMemberName(addr: string): string | null {
  for (const group of Object.values(GOV_GROUPS)) {
    const member = group.members.find(m => m.address.toLowerCase() === addr.toLowerCase());
    if (member) return member.name;
  }
  return null;
}

// Helper to check if an address is an authorized GOV attester
export const isAttesterAddress = (addr: string): boolean =>
  ALL_GOV_ADDRESSES.some(a => a.toLowerCase() === addr.toLowerCase());

// BSC Testnet RPC
export const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

// BSCScan URLs (Testnet - matching chainId 97)
export const BSCSCAN_URL = 'https://testnet.bscscan.com';
export const getTxUrl = (txHash: string) => `${BSCSCAN_URL}/tx/${txHash}`;
export const getAddressUrl = (address: string) => `${BSCSCAN_URL}/address/${address}`;

// Action Types
export type ActionType = 'post' | 'comment' | 'reaction' | 'share' | 'friend' | 'livestream' | 'new_user_bonus';

// Base Rewards (BR) - FUN tokens per action
export const BASE_REWARDS: Record<ActionType, number> = {
  post: 50,
  comment: 10,
  reaction: 10,
  share: 10,
  friend: 20,
  livestream: 200,
  new_user_bonus: 500,
};

// Daily Caps per action type
export const DAILY_CAPS: Record<ActionType, { maxActions: number; maxReward: number }> = {
  post: { maxActions: 10, maxReward: 500 },
  comment: { maxActions: 50, maxReward: 500 },
  reaction: { maxActions: 50, maxReward: 500 },
  share: { maxActions: 10, maxReward: 100 },
  friend: { maxActions: 10, maxReward: 200 },
  livestream: { maxActions: 5, maxReward: 1000 },
  new_user_bonus: { maxActions: 1, maxReward: 500 },
};

// Total daily cap per user (FUN)
export const TOTAL_DAILY_CAP = 5000;

// Min content length for a `post` action to be eligible for Light Score.
// Bài text-only ngắn hơn ngưỡng này (sau trim) sẽ KHÔNG được cộng LS.
// Bài có ảnh/video vẫn được cộng LS bất kể độ dài caption.
// Áp dụng từ phía edge `pplp-evaluate`. FE dùng để hiển thị hint composer.
export const MIN_POST_LENGTH_FOR_LS = 50;

// Global epoch cap (FUN per day for entire platform)
export const GLOBAL_EPOCH_CAP = 10000000; // 10M FUN

// Tier definitions
export const TIERS = {
  0: { name: 'New Soul', minScore: 0, dailyCap: 500, emoji: '🌱' },
  1: { name: 'Light Seeker', minScore: 1000, dailyCap: 1000, emoji: '🌟' },
  2: { name: 'Light Bearer', minScore: 10000, dailyCap: 2500, emoji: '✨' },
  3: { name: 'Light Guardian', minScore: 100000, dailyCap: 5000, emoji: '👼' },
} as const;

// 5 Pillars of Light — PPLP v2.0 (Sám Hối, Biết Ơn, Phụng Sự, Giúp Đỡ, Trao Tặng)
export const PILLARS = {
  repentance: { name: 'Repentance', nameVi: 'Sám Hối', emoji: '🙏' },
  gratitude: { name: 'Gratitude', nameVi: 'Biết Ơn', emoji: '💛' },
  service: { name: 'Service', nameVi: 'Phụng Sự', emoji: '☀️' },
  help: { name: 'Help', nameVi: 'Giúp Đỡ', emoji: '🤝' },
  giving: { name: 'Giving', nameVi: 'Trao Tặng', emoji: '🎁' },
} as const;

// Legacy pillars mapping (for backward compat with existing data)
export const LEGACY_PILLARS = {
  service: { name: 'Service to Life', nameVi: 'Phụng sự sự sống', emoji: '☀️' },
  truth: { name: 'Transparent Truth', nameVi: 'Chân thật minh bạch', emoji: '🔍' },
  healing: { name: 'Healing & Love', nameVi: 'Chữa lành & yêu thương', emoji: '💚' },
  value: { name: 'Long-term Value', nameVi: 'Đóng góp bền vững', emoji: '🌱' },
  unity: { name: 'Unity', nameVi: 'Hợp Nhất', emoji: '🤝' },
} as const;

// =============================================
// 5 Dimension Scores (User-level Reputation — Whitepaper v1)
// =============================================

export const DIMENSION_WEIGHTS = {
  identity: 0.2,
  activity: 0.2,
  onchain: 0.2,
  transparency: 0.2,
  ecosystem: 0.2,
} as const;

export const DIMENSION_LEVELS = {
  0: { name: 'Light Seed', minScore: 0, emoji: '🌱' },
  1: { name: 'Light Builder', minScore: 100, emoji: '🔨' },
  2: { name: 'Light Guardian', minScore: 250, emoji: '🛡️' },
  3: { name: 'Light Leader', minScore: 500, emoji: '👑' },
  4: { name: 'Cosmic Contributor', minScore: 800, emoji: '🌌' },
} as const;

export const DIMENSIONS = {
  identity: { name: 'Identity', nameVi: 'Danh tính', emoji: '🪪', color: 'blue' },
  activity: { name: 'Activity', nameVi: 'Hoạt động', emoji: '⚡', color: 'amber' },
  onchain: { name: 'On-Chain', nameVi: 'On-Chain', emoji: '⛓️', color: 'purple' },
  transparency: { name: 'Transparency', nameVi: 'Minh bạch', emoji: '🔍', color: 'green' },
  ecosystem: { name: 'Ecosystem', nameVi: 'Hệ sinh thái', emoji: '🌐', color: 'rose' },
} as const;

export type DimensionKey = keyof typeof DIMENSIONS;

// Score ranges for ANGEL AI evaluation
export const SCORE_RANGES = {
  quality: { min: 0.5, max: 3.0, default: 1.0 },
  impact: { min: 0.5, max: 5.0, default: 1.0 },
  integrity: { min: 0, max: 1.0, default: 1.0 },
  unity: { min: 0, max: 100, default: 50 },
};

// Unity Multiplier formula: Ux = 0.5 + (U / 50)
export const calculateUnityMultiplier = (unityScore: number): number => {
  return Math.max(0.5, Math.min(2.5, 0.5 + (unityScore / 50)));
};

// Legacy Light Score formula (without LS-Math multipliers): BR × Q × I × K × Ux
export const calculateLightScoreLegacy = (
  baseReward: number,
  qualityScore: number,
  impactScore: number,
  integrityScore: number,
  unityMultiplier: number
): number => {
  return Math.round(baseReward * qualityScore * impactScore * integrityScore * unityMultiplier * 100) / 100;
};

// =============================================
// LS-Math-v1.0 Configuration
// Full spec: scoring_rules_v1.yaml
// =============================================
export const LS_MATH_CONFIG = {
  version: 'LS-Math-v1.0' as const,
  weights: { base_action: 0.4, content: 0.6 },
  reputation: {
    alpha: 0.25,
    w_min: 0.5,
    w_max: 2.0,
  },
  content: {
    gamma: 1.3,
    type_multiplier: {
      post: 1.0,
      comment: 0.6,
      video: 1.2,
      course: 1.5,
      bug_report: 1.1,
      proposal: 1.3,
    } as Record<string, number>,
  },
  consistency: { beta: 0.6, lambda: 30 },
  sequence: { eta: 0.5, kappa: 5 },
  penalty: { theta: 0.8, max_penalty: 0.5 },
  mint: {
    epoch_type: 'monthly' as const,
    anti_whale_cap: 0.03,
    min_light_threshold: 10,
  },
} as const;

// LS-Math-v1.0: Consistency Multiplier
// M_cons = 1 + β(1 - e^(-streak/λ))
export const calculateConsistencyMultiplier = (streakDays: number): number => {
  const { beta, lambda } = LS_MATH_CONFIG.consistency;
  return 1 + beta * (1 - Math.exp(-streakDays / lambda));
};

// LS-Math-v1.0: Sequence Multiplier
// M_seq = 1 + η·tanh(bonus/κ)
export const calculateSequenceMultiplier = (bonus: number): number => {
  const { eta, kappa } = LS_MATH_CONFIG.sequence;
  return 1 + eta * Math.tanh(bonus / kappa);
};

// LS-Math-v1.0: Integrity Penalty
// Π = 1 - min(π_max, θ·risk)  where risk = 1 - integrity_score
export const calculateIntegrityPenalty = (integrityScore: number): number => {
  const { theta, max_penalty } = LS_MATH_CONFIG.penalty;
  const risk = 1 - integrityScore;
  return 1 - Math.min(max_penalty, theta * risk);
};

// LS-Math-v1.0: Reputation Weight
// w_u = clip(w_min, w_max, 1 + α·log(1 + R_u))
export const calculateReputationWeight = (reputationScore: number): number => {
  const { alpha, w_min, w_max } = LS_MATH_CONFIG.reputation;
  return Math.max(w_min, Math.min(w_max, 1 + alpha * Math.log(1 + reputationScore)));
};

// LS-Math-v1.0: Content Normalization
// h(P_c) = (P_c / 10)^γ
export const normalizeContentScore = (pillarTotal: number): number => {
  const { gamma } = LS_MATH_CONFIG.content;
  return Math.pow(Math.max(0, Math.min(1, pillarTotal / 10)), gamma);
};

// LS-Math-v1.0: Full Light Score formula
// L = BR × Q × I × K × Ux × M_cons × M_seq × Π
export const calculateLightScore = (
  baseReward: number,
  qualityScore: number,
  impactScore: number,
  integrityScore: number,
  unityMultiplier: number,
  consistencyMultiplier: number = 1.0,
  sequenceMultiplier: number = 1.0,
  integrityPenalty: number = 1.0,
): number => {
  return Math.round(
    baseReward * qualityScore * impactScore * integrityScore * unityMultiplier
    * consistencyMultiplier * sequenceMultiplier * integrityPenalty * 100
  ) / 100;
};

// Mint eligibility threshold
export const MIN_LIGHT_SCORE_FOR_MINT = 10; // Minimum score to be eligible
export const MIN_MINT_AMOUNT = 200; // Minimum FUN to create a mint request
export const MIN_INTEGRITY_SCORE = 0.3; // Below this = suspected bot/spam

// Cooldown settings
export const CLAIM_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between claims

// =============================================
// EIP-712 Configuration for lockWithPPLP
// =============================================

// EIP-712 Domain - MUST match contract exactly
export const EIP712_DOMAIN = {
  name: 'FUN Money',
  version: '1.2.1',
  chainId: 97,
  verifyingContract: FUN_MONEY_CONTRACT.address,
} as const;

// EIP-712 Types for PureLoveProof - MUST match contract PPLP_TYPEHASH exactly:
// keccak256("PureLoveProof(address user,bytes32 actionHash,uint256 amount,bytes32 evidenceHash,uint256 nonce)")
export const EIP712_PPLP_TYPES = {
  PureLoveProof: [
    { name: 'user', type: 'address' },
    { name: 'actionHash', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// Legacy export for backwards compatibility
export const EIP712_LOCK_TYPES = EIP712_PPLP_TYPES;

// Contract ABI for FUN Money v1.2.1
// Based on FUNMoneyProductionV1_2_1 verified source
export const FUN_MONEY_ABI = [
  // Read functions
  {
    name: 'nonces',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'alloc',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'locked', type: 'uint256' },
      { name: 'activated', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'actions',
    type: 'function',
    inputs: [{ name: 'actionHash', type: 'bytes32' }],
    outputs: [
      { name: 'allowed', type: 'bool' },
      { name: 'version', type: 'uint32' },
      { name: 'deprecated', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'isAttester',
    type: 'function',
    inputs: [{ name: 'attester', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  // Write functions - lockWithPPLP matches contract signature exactly
  {
    name: 'lockWithPPLP',
    type: 'function',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'action', type: 'string' },      // STRING action name, not bytes32!
      { name: 'amount', type: 'uint256' },
      { name: 'evidenceHash', type: 'bytes32' },
      { name: 'sigs', type: 'bytes[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'activate',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'claim',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// =============================================
// Distribution Configuration
// =============================================

// 3-Level Cascade Distribution
// Community Genesis Pool → FUN Platform Pool → FUN Partner Pool → User
// 100% → 99% → 98.01% → 97.03%
export const DISTRIBUTION = {
  COMMUNITY_GENESIS_KEEP: 0.01, // 1%
  PLATFORM_POOL_KEEP: 0.01, // 1% of remaining
  PARTNER_POOL_KEEP: 0.01, // 1% of remaining
  USER_RECEIVE_RATIO: 0.9703, // 97.03% of minted amount
} as const;

// Token States
export const TOKEN_STATES = {
  LOCKED: 'locked',
  ACTIVATED: 'activated',
} as const;

// =============================================
// FUNMoneyMinter v2 — Direct Mint Contract
// Backend authorized minter calls directly
// Immutable 99/1 split on-chain
// =============================================

export const FUN_MONEY_MINTER_V2 = {
  // Placeholder — update after owner deploys contract
  address: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  chainId: 97,
  name: 'FUNMoneyMinter',
} as const;

export const FUN_MONEY_MINTER_V2_ABI = [
  // Read
  { name: 'USER_BPS', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint16' }], stateMutability: 'view' },
  { name: 'PLATFORM_BPS', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint16' }], stateMutability: 'view' },
  { name: 'BPS_DENOMINATOR', type: 'function', inputs: [], outputs: [{ name: '', type: 'uint16' }], stateMutability: 'view' },
  { name: 'owner', type: 'function', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'funToken', type: 'function', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'platformTreasury', type: 'function', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { name: 'authorizedMinters', type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { name: 'processedActionIds', type: 'function', inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  {
    name: 'getLockedGrants',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{
      name: '', type: 'tuple[]',
      components: [
        { name: 'amount', type: 'uint256' },
        { name: 'releaseAt', type: 'uint64' },
        { name: 'claimed', type: 'bool' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    name: 'previewSplit',
    type: 'function',
    inputs: [{ name: 'totalMint', type: 'uint256' }],
    outputs: [
      { name: 'userMint', type: 'uint256' },
      { name: 'platformMint', type: 'uint256' },
    ],
    stateMutability: 'pure',
  },
  // Write
  {
    name: 'mintValidatedAction',
    type: 'function',
    inputs: [
      { name: 'actionId', type: 'bytes32' },
      { name: 'user', type: 'address' },
      { name: 'totalMint', type: 'uint256' },
      { name: 'validationDigest', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'mintValidatedActionLocked',
    type: 'function',
    inputs: [
      { name: 'actionId', type: 'bytes32' },
      { name: 'user', type: 'address' },
      { name: 'totalMint', type: 'uint256' },
      { name: 'userClaimableNow', type: 'uint256' },
      { name: 'releaseAt', type: 'uint64' },
      { name: 'validationDigest', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'releaseLockedGrant',
    type: 'function',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Events
  {
    name: 'ActionMinted',
    type: 'event',
    inputs: [
      { name: 'actionId', type: 'bytes32', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'totalMint', type: 'uint256', indexed: false },
      { name: 'userMint', type: 'uint256', indexed: false },
      { name: 'platformMint', type: 'uint256', indexed: false },
      { name: 'validationDigest', type: 'bytes32', indexed: false },
    ],
  },
  {
    name: 'ActionMintedLocked',
    type: 'event',
    inputs: [
      { name: 'actionId', type: 'bytes32', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'totalMint', type: 'uint256', indexed: false },
      { name: 'userClaimable', type: 'uint256', indexed: false },
      { name: 'userLocked', type: 'uint256', indexed: false },
      { name: 'platformMint', type: 'uint256', indexed: false },
      { name: 'releaseAt', type: 'uint64', indexed: false },
      { name: 'validationDigest', type: 'bytes32', indexed: false },
    ],
  },
  {
    name: 'LockedBalanceReleased',
    type: 'event',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

// Mint Request Status (v1 legacy)
export const MINT_REQUEST_STATUS = {
  PENDING_SIG: 'pending_sig',
  SIGNED: 'signed',
  SUBMITTED: 'submitted',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
} as const;

export type MintRequestStatus = typeof MINT_REQUEST_STATUS[keyof typeof MINT_REQUEST_STATUS];

// Signature deadline (1 hour from creation)
export const SIGNATURE_DEADLINE_SECONDS = 3600;

// Light Activities that earn FUN
export const LIGHT_ACTIVITIES = [
  'post', 'comment', 'reaction', 'share', 'friend', 'donate', 'livestream'
] as const;

// =============================================
// Helper Functions
// =============================================

// Convert FUN amount to Wei (18 decimals)
// Uses string-based arithmetic to avoid floating-point precision loss
// for amounts exceeding Number.MAX_SAFE_INTEGER when multiplied by 1e18
export const toWei = (amount: number | string): bigint => {
  const str = typeof amount === 'number' ? amount.toString() : amount;
  const [intPart, decPart = ''] = str.split('.');
  // Pad or truncate decimal part to exactly 18 digits
  const padded = (decPart + '000000000000000000').slice(0, 18);
  // Remove leading zeros from combined string to avoid issues, then convert
  const combined = intPart + padded;
  return BigInt(combined);
};

// Convert Wei to FUN amount
export const fromWei = (wei: bigint | string): number => {
  const weiNum = typeof wei === 'string' ? BigInt(wei) : wei;
  return Number(weiNum) / 1e18;
};

// Format FUN amount for display
export const formatFUN = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Calculate estimated user receive amount
export const calculateUserReceive = (mintAmount: number): number => {
  return mintAmount * DISTRIBUTION.USER_RECEIVE_RATIO;
};
