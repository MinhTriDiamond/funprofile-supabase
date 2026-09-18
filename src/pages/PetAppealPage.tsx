import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { useSubmitPetRiskAppeal, usePetRiskAppeals, usePetRisk, petRiskTierLabel } from '@/modules/pet/hooks/usePetRisk';
import { format } from 'date-fns';
import { PetGuideLink } from '@/modules/pet/components/PetGuideLink';
import { PetSectionNav } from '@/modules/pet/components/PetSectionNav';
import { BackToHomeBar } from '@/components/layout/BackToHome';
import { MiniGameAppBar } from '@/modules/pet/components/MiniGameAppBar';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function PetAppealPage() {
  const [message, setMessage] = useState('');
  const { isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const submit = useSubmitPetRiskAppeal();
  const { data: appeals } = usePetRiskAppeals();
  const { data: risk } = usePetRisk();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <div className="container mx-auto max-w-2xl px-4 py-6">
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Đang tải…
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <FacebookNavbar />
        <div className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
          <BackToHomeBar fallback="/pet" inline />
          <PetSectionNav active="appeal" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Kháng nghị linh thú
                <PetGuideLink className="ml-auto font-normal" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Vui lòng đăng nhập để gửi kháng nghị về Linh thú của bạn.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/auth">Đăng nhập</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/pet">Về trang Linh thú</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const onSubmit = async () => {
    if (message.trim().length < 20) {
      toast.error('Vui lòng viết ít nhất 20 ký tự để giải thích.');
      return;
    }
    try {
      await submit.mutateAsync({ message: message.trim() });
      toast.success('Đã gửi kháng nghị. Admin sẽ xem xét trong 24-48h.');
      setMessage('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Không gửi được kháng nghị.');
    }
  };

  const hasPending = appeals?.some(a => a.status === 'pending');

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <div className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
        <MiniGameAppBar
          title="Kháng nghị linh thú"
          icon={ShieldAlert}
          iconClassName="w-5 h-5 text-slate-500"
          right={
            <>
              {risk && risk.risk_tier !== 'safe' && (
                <Badge variant="outline">{petRiskTierLabel(risk.risk_tier).label}</Badge>
              )}
              <PetGuideLink />
            </>
          }
        />
        <BackToHomeBar fallback="/pet" inline />
        <PetSectionNav active="appeal" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Kháng nghị linh thú
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Nếu bạn cho rằng linh thú bị đánh dấu nhầm, hãy mô tả chi tiết hành vi của bạn để admin xem xét.
              Cung cấp càng nhiều ngữ cảnh càng tốt (mục đích, thời điểm, người tương tác…).
            </p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tôi nuôi linh thú để... và đã tương tác với..."
              rows={6}
              maxLength={2000}
              disabled={hasPending}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{message.length}/2000</span>
              {hasPending && <span>Bạn đã có 1 kháng nghị đang chờ xử lý.</span>}
            </div>
            <Button onClick={onSubmit} disabled={submit.isPending || hasPending}>
              {submit.isPending ? 'Đang gửi…' : 'Gửi kháng nghị'}
            </Button>
          </CardContent>
        </Card>

        {appeals && appeals.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Lịch sử kháng nghị</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {appeals.map(a => (
                <div key={a.id} className="border border-border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant={a.status === 'approved' ? 'default' : a.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {a.status === 'pending' ? 'Đang chờ' : a.status === 'approved' ? 'Chấp thuận' : 'Từ chối'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(a.created_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  <p className="text-foreground whitespace-pre-wrap">{a.message}</p>
                  {a.admin_note && (
                    <p className="text-xs text-muted-foreground mt-2 italic">Phản hồi admin: {a.admin_note}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
