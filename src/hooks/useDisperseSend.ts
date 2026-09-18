/**
 * useDisperseSend — Gửi token tới nhiều ví trong 1 (hoặc vài) chữ ký
 * qua contract FunDisperse.
 *
 * - BNB native: gọi `disperseEther` với msg.value = sum(amounts).
 * - ERC20: kiểm tra allowance(spender = disperse). Nếu thiếu → approve(MaxUint256) 1 lần,
 *   sau đó gọi `disperseToken` cho từng lô ≤ MAX_RECIPIENTS_PER_TX.
 *
 * Trả về callback `disperseSend` + state để UI có thể hiển thị tiến trình.
 *
 * Lưu ý: KHÔNG ghi DB ở đây. Caller (UnifiedGiftSendDialog) sẽ ghi donation
 * cho từng recipient sau khi nhận tx hash của từng lô.
 */

import { useCallback, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useSwitchChain,
  useChainId,
} from 'wagmi';
import { parseEther, parseUnits, encodeFunctionData, maxUint256, type Address, type Hex } from 'viem';
import logger from '@/lib/logger';
import {
  FUN_DISPERSE_ABI,
  MAX_RECIPIENTS_PER_TX,
  getDisperseAddress,
  isDisperseAvailable,
} from '@/config/disperse';
import type { WalletToken } from '@/lib/tokens';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

export interface DisperseRecipientPayload {
  address: Address;
  /** decimal string, theo đơn vị "user" (chưa nhân decimals) */
  amount: string;
  /** Reference id để caller map ngược (vd: user id) — không truyền lên chain. */
  refId?: string;
}

export interface DisperseBatchResult {
  batchIndex: number;
  txHash: Hex;
  recipients: DisperseRecipientPayload[];
}

export interface DisperseSendParams {
  token: WalletToken;
  recipients: DisperseRecipientPayload[];
  targetChainId: number;
  /** Báo tiến trình cho UI (optional). */
  onProgress?: (step: {
    phase: 'switching' | 'approving' | 'signing' | 'confirming' | 'done';
    batchIndex?: number;
    totalBatches?: number;
    txHash?: Hex;
  }) => void;
}

export type DisperseStep =
  | 'idle'
  | 'switching'
  | 'approving'
  | 'signing'
  | 'confirming'
  | 'done'
  | 'error';

function toRawAmount(token: WalletToken, amount: string): bigint {
  // Dùng parseUnits/parseEther dạng STRING để tránh mất chính xác float.
  if (!token.address) return parseEther(amount);
  return parseUnits(amount, token.decimals);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function makeBatchId(): Hex {
  // 32-byte random id (không cần on-chain unique tuyệt đối, chỉ để indexer)
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
}

export function useDisperseSend() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const currentChainId = useChainId();

  const [step, setStep] = useState<DisperseStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
  }, []);

  const disperseSend = useCallback(
    async ({
      token,
      recipients,
      targetChainId,
      onProgress,
    }: DisperseSendParams): Promise<DisperseBatchResult[]> => {
      setError(null);
      if (!address) throw new Error('Chưa kết nối ví');
      if (!walletClient) throw new Error('Wallet client chưa sẵn sàng');
      if (!publicClient) throw new Error('Public client chưa sẵn sàng');
      if (recipients.length === 0) throw new Error('Danh sách người nhận trống');

      const disperseAddr = getDisperseAddress(targetChainId);
      if (!disperseAddr || !isDisperseAvailable(targetChainId)) {
        throw new Error('FunDisperse chưa khả dụng trên chain này');
      }

      // 1. Chuyển chain nếu cần
      if (currentChainId !== targetChainId) {
        setStep('switching');
        onProgress?.({ phase: 'switching' });
        await switchChainAsync({ chainId: targetChainId });
      }

      const isNative = !token.address;
      const totalRaw = recipients.reduce((sum, r) => sum + toRawAmount(token, r.amount), 0n);

      // 2. ERC20: check + approve nếu cần
      if (!isNative) {
        const tokenAddr = token.address as Address;
        const allowance = (await publicClient.readContract({
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, disperseAddr],
        } as never)) as bigint;

        if (allowance < totalRaw) {
          setStep('approving');
          onProgress?.({ phase: 'approving' });
          const approveData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [disperseAddr, maxUint256],
          });
          const approveHash = await walletClient.sendTransaction({
            to: tokenAddr,
            data: approveData,
            account: address,
            chain: undefined,
          } as never);
          await publicClient.waitForTransactionReceipt({
            hash: approveHash,
            confirmations: 1,
            timeout: 90_000,
          });
          logger.debug('[DISPERSE] approve confirmed', approveHash);
        }
      }

      // 3. Chia lô và gửi
      const batches = chunk(recipients, MAX_RECIPIENTS_PER_TX);
      const results: DisperseBatchResult[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batchRecipients = batches[i];
        const addresses = batchRecipients.map((r) => r.address);
        const amounts = batchRecipients.map((r) => toRawAmount(token, r.amount));
        const sumBatch = amounts.reduce((s, v) => s + v, 0n);
        const batchId = makeBatchId();

        setStep('signing');
        onProgress?.({
          phase: 'signing',
          batchIndex: i,
          totalBatches: batches.length,
        });

        let txHash: Hex;
        if (isNative) {
          const data = encodeFunctionData({
            abi: FUN_DISPERSE_ABI,
            functionName: 'disperseEther',
            args: [addresses, amounts, batchId],
          });
          txHash = await walletClient.sendTransaction({
            to: disperseAddr,
            data,
            value: sumBatch,
            account: address,
            chain: undefined,
          } as never);
        } else {
          const data = encodeFunctionData({
            abi: FUN_DISPERSE_ABI,
            functionName: 'disperseToken',
            args: [token.address as Address, addresses, amounts, batchId],
          });
          txHash = await walletClient.sendTransaction({
            to: disperseAddr,
            data,
            account: address,
            chain: undefined,
          } as never);
        }

        setStep('confirming');
        onProgress?.({
          phase: 'confirming',
          batchIndex: i,
          totalBatches: batches.length,
          txHash,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
          timeout: 120_000,
        });
        if (receipt.status !== 'success') {
          throw new Error(`Lô ${i + 1}/${batches.length} thất bại trên chain`);
        }

        results.push({ batchIndex: i, txHash, recipients: batchRecipients });
        logger.debug(`[DISPERSE] batch ${i + 1}/${batches.length} ok`, txHash);
      }

      setStep('done');
      onProgress?.({ phase: 'done' });
      return results;
    },
    [address, walletClient, publicClient, currentChainId, switchChainAsync],
  );

  return {
    disperseSend,
    step,
    error,
    reset,
    setError,
  };
}
