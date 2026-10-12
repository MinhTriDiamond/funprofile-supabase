import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
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
  const { t } = useLanguage();
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
              {t('papLoading')}
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
                {t('papTitle')}
                <PetGuideLink className="ml-auto font-normal" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('papLoginDesc')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/auth">{t('cemLoginBtn')}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/pet">{t('papBackToPet')}</Link>
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
      toast.error(t('papTooShort'));
      return;
    }
    try {
      await submit.mutateAsync({ message: message.trim() });
      toast.success(t('papSent'));
      setMessage('');
    } catch (e: any) {
      toast.error(e?.message ?? t('papSendFail'));
    }
  };

  const hasPending = appeals?.some(a => a.status === 'pending');

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <div className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
        <MiniGameAppBar
          title="{t('papTitle')}"
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
              {t('papTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('papFormDesc')}
              
            </p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('papPlaceholder')}
              rows={6}
              maxLength={2000}
              disabled={hasPending}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{message.length}/2000</span>
              {hasPending && <span>{t('papPendingNote')}</span>}
            </div>
            <Button onClick={onSubmit} disabled={submit.isPending || hasPending}>
              {submit.isPending ? t('papSubmitting') : t('papSubmit')}
            </Button>
          </CardContent>
        </Card>

        {appeals && appeals.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t('papHistory')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {appeals.map(a => (
                <div key={a.id} className="border border-border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant={a.status === 'approved' ? 'default' : a.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {a.status === 'pending' ? t('papStatusPending') : a.status === 'approved' ? t('papStatusApproved') : t('papStatusRejected')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(a.created_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  <p className="text-foreground whitespace-pre-wrap">{a.message}</p>
                  {a.admin_note && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{t('papAdminNote')}{a.admin_note}</p>
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
