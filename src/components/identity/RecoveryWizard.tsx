import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mail, Wallet, Users, Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useDID } from '@/hooks/useDID';

const METHODS = [
  { key: 'primary', icon: Mail, label: 'Email / Passkey', desc: 'Xác thực qua email hoặc passkey, không cần chờ' },
  { key: 'wallet_backup', icon: Wallet, label: 'Wallet backup', desc: 'Ký bằng ví backup đã liên kết trước đó' },
  { key: 'guardian', icon: Users, label: 'Trusted Guardians', desc: 'Cần 2 guardian active xác nhận. Freeze mint 7 ngày.' },
  { key: 'governance', icon: Crown, label: 'Governance Recovery', desc: 'Chỉ DID L3+. Cần 3 admin xác nhận.' },
] as const;

export function RecoveryWizard() {
  const { data: did } = useDID();
  const [method, setMethod] = useState<string>('primary');
  const [evidence, setEvidence] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const initiate = async () => {
    if (!did?.did_id) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('identity-recovery-initiate', {
        body: { method, target_did_id: did.did_id, evidence: { note: evidence } },
      });
      if (error) throw error;
      toast.success('Đã khởi tạo recovery', {
        description: data?.requires_attestations > 0 ? `Cần ${data.requires_attestations} xác nhận` : 'Hoàn tất',
      });
      setEvidence('');
    } catch (e: any) {
      toast.error('Lỗi recovery', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Khởi tạo Recovery</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {METHODS.map((m) => {
            const Icon = m.icon;
            const active = method === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`text-left rounded border p-2.5 transition-colors ${active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-semibold">{m.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">{m.desc}</p>
              </button>
            );
          })}
        </div>

        <Textarea
          placeholder="Lý do recovery (tuỳ chọn, sẽ được log)"
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          className="text-xs min-h-[60px]"
        />

        <Button onClick={initiate} disabled={submitting || !did?.did_id} className="w-full" size="sm">
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Khởi tạo
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          Cooldown 24h giữa các lần. Tối đa 3 lần / 30 ngày.
        </p>
      </CardContent>
    </Card>
  );
}
