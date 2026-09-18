import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Coins, ArrowRight, Shield } from 'lucide-react';
import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { FUN_MONEY_MINTER_V2, FUN_MONEY_MINTER_V2_ABI, toWei, fromWei } from '@/config/pplp';

export function MinterV2AdminPanel() {
  const [previewAmount, setPreviewAmount] = useState('1000');
  const isConfigured = FUN_MONEY_MINTER_V2.address !== '0x0000000000000000000000000000000000000000';

  const amountWei = (() => {
    try { return toWei(Number(previewAmount) || 0); } catch { return 0n; }
  })();

  const { data: splitData } = useReadContract({
    address: FUN_MONEY_MINTER_V2.address,
    abi: FUN_MONEY_MINTER_V2_ABI,
    functionName: 'previewSplit',
    args: [amountWei],
    chainId: FUN_MONEY_MINTER_V2.chainId,
    query: { enabled: isConfigured && amountWei > 0n },
  });

  const userMint = splitData ? fromWei((splitData as any)[0]) : 0;
  const platformMint = splitData ? fromWei((splitData as any)[1]) : 0;

  if (!isConfigured) {
    return (
      <Card className="border-dashed border-amber-500/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-500" />
            FUNMoneyMinter v2
            <Badge variant="outline" className="text-amber-600">Chưa deploy</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Contract chưa được deploy. Cần owner triển khai và cung cấp địa chỉ contract.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Coins className="w-4 h-4 text-primary" />
          FUNMoneyMinter v2 — Preview Split
          <Badge variant="secondary">99/1 On-Chain</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={previewAmount}
            onChange={(e) => setPreviewAmount(e.target.value)}
            placeholder="Số FUN"
            className="w-32 text-sm"
          />
          <span className="text-xs text-muted-foreground">FUN tổng</span>
        </div>

        {splitData && (
          <div className="flex items-center gap-3 text-sm">
            <div className="flex-1 p-2 rounded bg-green-500/10 text-center">
              <div className="text-xs text-muted-foreground">User (99%)</div>
              <div className="font-bold text-green-600">{userMint.toFixed(2)} FUN</div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1 p-2 rounded bg-blue-500/10 text-center">
              <div className="text-xs text-muted-foreground">Platform (1%)</div>
              <div className="font-bold text-blue-600">{platformMint.toFixed(2)} FUN</div>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Split được thực thi on-chain — không thể thay đổi.
        </div>
      </CardContent>
    </Card>
  );
}
