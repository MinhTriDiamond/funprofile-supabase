/**
 * FunDisperse contract addresses per chain.
 *
 * TODO: Điền địa chỉ sau khi Cha deploy contract theo .lovable/fundisperse-deploy-guide.md
 *       - BSC Testnet (97): chưa deploy
 *       - BSC Mainnet (56): chưa deploy
 */

export const DISPERSE_ADDRESSES: Record<number, `0x${string}` | null> = {
  56: null,  // BSC Mainnet — TODO
  97: null,  // BSC Testnet — TODO
};

// Phase 1: dùng luồng ký tuần tự (no contract) — cap 99 ví/lần để UX hợp lý.
// Khi FunDisperse deploy xong sẽ nâng lên 999 với 1 chữ ký.
export const MAX_RECIPIENTS_TOTAL = 99;
export const MAX_RECIPIENTS_PER_TX = 99;

export function getDisperseAddress(chainId: number): `0x${string}` | null {
  return DISPERSE_ADDRESSES[chainId] ?? null;
}

export function isDisperseAvailable(chainId: number): boolean {
  return !!DISPERSE_ADDRESSES[chainId];
}

export const FUN_DISPERSE_ABI = [
  {
    type: 'function',
    name: 'disperseEther',
    stateMutability: 'payable',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'batchId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'disperseToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'batchId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'BatchDispersed',
    inputs: [
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: true, name: 'token', type: 'address' },
      { indexed: false, name: 'totalAmount', type: 'uint256' },
      { indexed: false, name: 'recipientCount', type: 'uint256' },
      { indexed: false, name: 'batchId', type: 'bytes32' },
    ],
  },
] as const;
