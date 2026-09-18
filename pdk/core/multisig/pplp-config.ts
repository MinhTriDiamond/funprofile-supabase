// =============================================
// PPLP Multisig Configuration - Portable Package
// Dùng cho: FUN Profile, FUN Play, ANGEL AI
// Không phụ thuộc vào framework cụ thể
// =============================================

export const FUN_MONEY_CONTRACT = {
  address: '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6' as const,
  chainId: 97, // BSC Testnet
  name: 'FUN Money',
  symbol: 'FUN',
  decimals: 18,
};

// =============================================
// EIP-712 Domain & Types
// PHẢI khớp chính xác với FUNMoneyProductionV1_2_1 contract
// =============================================

export const EIP712_DOMAIN = {
  name: 'FUN Money',
  version: '1.2.1',
  chainId: 97,
  verifyingContract: FUN_MONEY_CONTRACT.address,
} as const;

export const EIP712_PPLP_TYPES = {
  PureLoveProof: [
    { name: 'user', type: 'address' },
    { name: 'actionHash', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// =============================================
// GOV-COMMUNITY Multisig: WILL + WISDOM + LOVE
// 11 đại diện cộng đồng, chia 3 nhóm
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

// Tất cả 11 địa chỉ GOV
export const ALL_GOV_ADDRESSES: readonly string[] = Object.values(GOV_GROUPS).flatMap(
  (g) => g.members.map((m) => m.address)
);

// =============================================
// Helper Functions
// =============================================

/** Tìm nhóm GOV của một địa chỉ ví */
export function getGovGroupForAddress(addr: string): GovGroupKey | null {
  for (const [key, group] of Object.entries(GOV_GROUPS)) {
    if (group.members.some((m) => m.address.toLowerCase() === addr.toLowerCase())) {
      return key as GovGroupKey;
    }
  }
  return null;
}

/** Tìm tên thành viên GOV */
export function getGovMemberName(addr: string): string | null {
  for (const group of Object.values(GOV_GROUPS)) {
    const member = group.members.find(
      (m) => m.address.toLowerCase() === addr.toLowerCase()
    );
    if (member) return member.name;
  }
  return null;
}

/** Kiểm tra địa chỉ có phải attester không */
export const isAttesterAddress = (addr: string): boolean =>
  ALL_GOV_ADDRESSES.some((a) => a.toLowerCase() === addr.toLowerCase());

// =============================================
// Token Utilities
// =============================================

/** Chuyển FUN amount sang Wei (18 decimals) */
export const toWei = (amount: number | string): bigint => {
  const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
  return BigInt(Math.floor(amountNum * 1e18));
};

/** Chuyển Wei sang FUN amount */
export const fromWei = (wei: bigint | string): number => {
  const weiNum = typeof wei === 'string' ? BigInt(wei) : wei;
  return Number(weiNum) / 1e18;
};

/** Format FUN amount cho hiển thị */
export const formatFUN = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

// =============================================
// Mint Request Status Constants
// =============================================

export const MINT_REQUEST_STATUS = {
  PENDING_SIG: 'pending_sig',
  SIGNING: 'signing',
  SIGNED: 'signed',
  SUBMITTED: 'submitted',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  EXPIRED: 'expired',
  REJECTED: 'rejected',
} as const;

export type MintRequestStatus =
  (typeof MINT_REQUEST_STATUS)[keyof typeof MINT_REQUEST_STATUS];

// BSCScan URLs (Testnet)
export const BSCSCAN_URL = 'https://testnet.bscscan.com';
export const getTxUrl = (txHash: string) => `${BSCSCAN_URL}/tx/${txHash}`;
export const getAddressUrl = (address: string) => `${BSCSCAN_URL}/address/${address}`;

// BSC Testnet RPC
export const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

// Thresholds
export const MIN_MINT_AMOUNT = 200; // Tối thiểu 200 FUN
export const MAX_REQUESTS_PER_DAY = 2; // Tối đa 2 request/ngày/user
export const SIGNATURE_DEADLINE_SECONDS = 3600; // 1 giờ
