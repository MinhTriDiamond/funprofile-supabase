import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Sparkles, ArrowRight, Shield, Award, Fingerprint } from 'lucide-react';
import { useDID } from '@/hooks/useDID';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { useMyGuardians } from '@/hooks/useGuardians';
import { useNavigate } from 'react-router-dom';

export function StepFinish() {
  const navigate = useNavigate();
  const { data: did } = useDID();
  const { data: trust } = useTrustProfile();
  const { data: guardians = [] } = useMyGuardians();

  const guardianCount = guardians.filter((g: any) => g.status !== 'revoked').length;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-3 py-4">
        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Hoàn tất Onboarding Trust</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Bạn đã sẵn sàng tham gia hệ sinh thái FUN
          </p>
        </div>
      </div>

      <div className="grid gap-2.5">
        <SummaryRow
          icon={<Fingerprint className="w-4 h-4" />}
          label="DID"
          value={did?.did_level ?? 'L0'}
          ok
        />
        <SummaryRow
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Trust Coefficient"
          value={Number(trust?.tc ?? 0).toFixed(2)}
          ok
        />
        <SummaryRow
          icon={<Shield className="w-4 h-4" />}
          label="Guardians"
          value={`${guardianCount}/5`}
          ok={guardianCount >= 2}
        />
        <SummaryRow
          icon={<Award className="w-4 h-4" />}
          label="Trust Tier"
          value={trust?.trust_tier ?? 'T0'}
          ok
        />
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground">Bước tiếp theo</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Liên kết ví & các tài khoản mạng xã hội để tăng VS</li>
            <li>Đóng góp nội dung tích cực để nhận SBT</li>
            <li>Tham gia governance khi đạt Trust Tier T2+</li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Button onClick={() => navigate('/identity')} className="w-full" size="lg">
          Vào Identity Dashboard <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <Button onClick={() => navigate('/')} variant="outline" className="w-full">
          Về Bảng tin
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ icon, label, value, ok }: { icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
        {icon}
      </div>
      <span className="flex-1 text-sm">{label}</span>
      <Badge variant={ok ? 'default' : 'outline'}>{value}</Badge>
    </div>
  );
}
