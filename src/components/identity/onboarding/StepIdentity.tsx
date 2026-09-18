import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Fingerprint, Loader2, Mail, Sparkles, Wallet } from 'lucide-react';
import { useDID } from '@/hooks/useDID';
import { useDIDEligibility } from '@/hooks/useDIDEligibility';
import { useIdentityLinks } from '@/hooks/useIdentityLinks';
import { useWalletIdentitySync } from '@/hooks/useWalletIdentitySync';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

const short = (addr: string) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';

export function StepIdentity({ onNext }: { onNext: () => void }) {
  const { data: did, refetch } = useDID();
  const { data: checks = [], refetch: refetchEl } = useDIDEligibility();
  const { data: links = [], refetch: refetchLinks } = useIdentityLinks();
  const [promoting, setPromoting] = useState(false);

  // Tự động backfill ví hiện có vào identity_links
  useWalletIdentitySync(true);

  const l1 = checks.find((c) => c.level === 'L1');
  const hasEmail = l1?.requirements[0]?.met ?? false;
  const isAtLeastL1 = ['L1', 'L2', 'L3', 'L4'].includes(did?.did_level ?? '');

  const verifiedWallets = (links as any[]).filter(
    (l) => l.link_type === 'wallet' && l.verification_state === 'verified'
  );
  const hasWallet = verifiedWallets.length > 0;

  const promote = async () => {
    if (!did?.did_id) return;
    setPromoting(true);
    try {
      const { error } = await supabase.functions.invoke('identity-did-auto-promote', {
        body: { did_id: did.did_id, dry_run: false },
      });
      if (error) throw error;
      await Promise.all([refetch(), refetchEl(), refetchLinks()]);
      toast.success('Đã kiểm tra cấp DID');
    } catch (e: any) {
      toast.error('Không thể nâng cấp', { description: e.message });
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Fingerprint className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Định danh phi tập trung của bạn</h3>
              <p className="text-[11px] font-mono text-muted-foreground break-all mt-0.5">
                {did?.did_id ?? '—'}
              </p>
            </div>
            <Badge variant="outline">{did?.did_level ?? 'L0'}</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Điều kiện nâng cấp lên L1
        </h4>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2 text-sm rounded-lg border p-3">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1">Email đã xác thực</span>
            {hasEmail ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <Link to="/settings">Thêm email</Link>
              </Button>
            )}
          </li>
          <li className="flex items-start gap-2 text-sm rounded-lg border p-3">
            <Wallet className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <span>Liên kết ví {hasWallet ? '' : '(bắt buộc cho L2)'}</span>
              {!hasWallet && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  L2 còn cần TC ≥ 0.80 — sẽ hướng dẫn ở bước "Tăng Trust"
                </p>
              )}
              {hasWallet && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {verifiedWallets.slice(0, 3).map((w: any) => (
                    <Badge key={w.id ?? w.link_value} variant="outline" className="font-mono text-[10px] h-5">
                      {short(String(w.link_value))}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            {hasWallet ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
            ) : (
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <Link to="/wallet">Mở ví</Link>
              </Button>
            )}
          </li>
          <li className="flex items-center gap-2 text-sm rounded-lg border p-3">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1">Đồng ý Quy ước Ánh sáng</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </li>
        </ul>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={promote} disabled={promoting || !did?.did_id} className="flex-1">
          {promoting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Kiểm tra cấp DID
        </Button>
        <Button onClick={onNext} disabled={!hasEmail && !isAtLeastL1} className="flex-1">
          Tiếp tục
        </Button>
      </div>
      {!isAtLeastL1 && (
        <p className="text-[11px] text-muted-foreground text-center">
          Bạn vẫn có thể tiếp tục onboarding và nâng cấp DID sau.
        </p>
      )}
    </div>
  );
}
