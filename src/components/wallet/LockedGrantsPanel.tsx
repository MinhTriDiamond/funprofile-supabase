import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Unlock, Clock, AlertCircle } from 'lucide-react';
import { useLockedGrants } from '@/hooks/useLockedGrants';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { FUN_MONEY_MINTER_V2, FUN_MONEY_MINTER_V2_ABI, fromWei } from '@/config/pplp';
import { toast } from 'sonner';
import { useState } from 'react';

interface LockedGrantsPanelProps {
  walletAddress?: `0x${string}`;
}

export function LockedGrantsPanel({ walletAddress }: LockedGrantsPanelProps) {
  const { grants, releasableGrants, totalLocked, isLoading, isConfigured, refetch } = useLockedGrants(walletAddress);
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const [releasingIndex, setReleasingIndex] = useState<number | null>(null);

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash,
    },
  });

  if (!isConfigured) return null;
  if (isLoading || grants.length === 0) return null;

  const handleRelease = (index: number) => {
    setReleasingIndex(index);
    writeContract(
      {
        address: FUN_MONEY_MINTER_V2.address,
        abi: FUN_MONEY_MINTER_V2_ABI,
        functionName: 'releaseLockedGrant',
        args: [BigInt(index)],
      } as any,
      {
        onSuccess: () => {
          toast.success('Đã gửi giao dịch release!');
          refetch();
        },
        onError: (err) => {
          toast.error(`Lỗi: ${err.message.slice(0, 100)}`);
          setReleasingIndex(null);
        },
      },
    );
  };

  const now = BigInt(Math.floor(Date.now() / 1000));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          FUN Đang Khóa (Locked Grants)
          {totalLocked > 0n && (
            <Badge variant="secondary" className="ml-auto">
              {fromWei(totalLocked).toFixed(2)} FUN
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {grants.map((grant, idx) => {
          const isReleasable = !grant.claimed && now >= grant.releaseAt;
          const isClaimed = grant.claimed;
          const releaseDate = new Date(Number(grant.releaseAt) * 1000);

          return (
            <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  {fromWei(grant.amount).toFixed(2)} FUN
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {isClaimed
                    ? 'Đã nhận'
                    : isReleasable
                      ? 'Sẵn sàng nhận'
                      : `Mở khóa: ${releaseDate.toLocaleDateString('vi-VN')}`}
                </div>
              </div>
              <div>
                {isClaimed ? (
                  <Badge variant="outline" className="text-muted-foreground">Đã nhận</Badge>
                ) : isReleasable ? (
                  <Button
                    size="sm"
                    onClick={() => handleRelease(idx)}
                    disabled={isPending || isConfirming || releasingIndex === idx}
                  >
                    <Unlock className="w-3 h-3 mr-1" />
                    {releasingIndex === idx ? 'Đang xử lý...' : 'Nhận'}
                  </Button>
                ) : (
                  <Badge variant="secondary">
                    <Lock className="w-3 h-3 mr-1" />
                    Đang khóa
                  </Badge>
                )}
              </div>
            </div>
          );
        })}

        {releasableGrants.length > 0 && (
          <div className="text-xs text-primary flex items-center gap-1 pt-1">
            <AlertCircle className="w-3 h-3" />
            Bạn có {releasableGrants.length} khoản FUN sẵn sàng nhận!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
