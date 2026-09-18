// =============================================
// PPLP EIP-712 Configuration
// Must match FUNMoneyProductionV1_2_1 contract exactly
// =============================================

export const CONTRACT_ADDRESS = '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6';
export const CHAIN_ID = 97; // BSC Testnet

export const EIP712_DOMAIN = {
  name: 'FUN Money',
  version: '1.2.1',
  chainId: CHAIN_ID,
  verifyingContract: CONTRACT_ADDRESS,
} as const;

// PureLoveProof struct for attester signing
export const EIP712_TYPES = {
  PureLoveProof: [
    { name: 'user', type: 'address' },
    { name: 'actionHash', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

// Authorized attester addresses
export const ATTESTER_ADDRESSES = [
  // Will
  '0xe32d50a0badE4cbD5B0d6120d3A5FD07f63694f1',
  '0xfd0Da7a744245e7aCECCd786d5a743Ef9291a557',
  '0x02D5578173bd0DB25462BB32A254Cd4b2E6D9a0D',
  // Wisdom
  '0xCa319fBc39F519822385F2D0a0114B14fa89A301',
  '0xDf8249159BB67804D718bc8186f95B75CE5ECbe8',
  '0x5102Ecc4a458a1af76aFA50d23359a712658a402',
  '0xE3e97a95d3f61814473f6d1eEbBa8253286D65c5',
  // Love
  '0xE418a560611e80E4239F5513D41e583fC9AC2E6d',
  '0x67464Df3082828b3Cf10C5Cb08FC24A28228EFd1',
  '0x9ec8C51175526BEbB1D04100256De71CF99B7CCC',
  '0x57a7943F2808Fc24b0403f25bb4670c5d84b3f2e',
];

// BSC Testnet RPC endpoints (fallback chain)
export const BSC_TESTNET_RPCS = [
  'https://data-seed-prebsc-1-s1.binance.org:8545',
  'https://data-seed-prebsc-2-s1.binance.org:8545',
  'https://data-seed-prebsc-1-s2.binance.org:8545',
  'https://data-seed-prebsc-1-s3.binance.org:8545',
  'https://data-seed-prebsc-2-s3.binance.org:8545',
];

// lockWithPPLP ABI (only the function we need)
export const LOCK_WITH_PPLP_ABI = [
  {
    name: 'lockWithPPLP',
    type: 'function',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'action', type: 'string' },
      { name: 'amount', type: 'uint256' },
      { name: 'evidenceHash', type: 'bytes32' },
      { name: 'sigs', type: 'bytes[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'nonces',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isAttester',
    type: 'function',
    inputs: [{ name: 'attester', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
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
    name: 'alloc',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'locked', type: 'uint256' },
      { name: 'activated', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
] as const;

// Error classification for on-chain failures
export const ON_CHAIN_ERRORS = {
  ATTESTER_NOT_REGISTERED: 'Attester wallet not registered on contract',
  ACTION_NOT_REGISTERED: 'Action type not registered via govRegisterAction',
  INSUFFICIENT_GAS: 'Not enough tBNB for gas fees',
  RPC_FAILURE: 'All BSC Testnet RPCs failed',
  CONTRACT_REVERT: 'Contract execution reverted',
  NONCE_MISMATCH: 'Nonce does not match on-chain state',
} as const;
