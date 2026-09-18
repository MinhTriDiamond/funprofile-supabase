import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDID } from '@/hooks/useDID';
import { OnboardingProgress } from '@/components/identity/onboarding/OnboardingProgress';
import { StepIdentity } from '@/components/identity/onboarding/StepIdentity';
import { StepGuardian } from '@/components/identity/onboarding/StepGuardian';
import { StepAttestation } from '@/components/identity/onboarding/StepAttestation';
import { StepBoostTrust } from '@/components/identity/onboarding/StepBoostTrust';
import { StepFinish } from '@/components/identity/onboarding/StepFinish';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { BackToHomeBar, BackToHomeCTA } from '@/components/layout/BackToHome';

const STORAGE_KEY = 'identity-onboarding-step';

const STEPS = [
  { key: 'identity', label: 'Identity', description: 'Xác thực DID' },
  { key: 'guardian', label: 'Guardian', description: 'Mời người tin cậy' },
  { key: 'attestation', label: 'Attestation', description: 'Xác nhận chéo' },
  { key: 'boost', label: 'Tăng Trust', description: 'TC & lộ trình' },
  { key: 'finish', label: 'Hoàn tất', description: 'Sẵn sàng' },
];

export default function IdentityOnboarding() {
  const navigate = useNavigate();
  const { userId, isLoading: loading } = useCurrentUser();
  const { isLoading: didLoading } = useDID();
  const [stepIndex, setStepIndex] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return saved ? Math.min(Math.max(0, parseInt(saved, 10) || 0), STEPS.length - 1) : 0;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, String(stepIndex));
  }, [stepIndex]);

  if (loading || didLoading) {
    return (
      <div className="container py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!userId) return <Navigate to="/auth?redirect=/identity/onboarding" replace />;

  const next = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container max-w-2xl py-4 px-4 pb-32 space-y-5">
          <BackToHomeBar />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Onboarding Trust</h1>
              <p className="text-xs text-muted-foreground">
                Khởi tạo định danh & mạng lưới tin cậy của bạn
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/identity')}
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <OnboardingProgress steps={STEPS} currentIndex={stepIndex} />
            </CardHeader>
            <CardContent className="pt-4">
              {stepIndex === 0 && <StepIdentity onNext={next} />}
              {stepIndex === 1 && <StepGuardian onNext={next} onBack={back} />}
              {stepIndex === 2 && <StepAttestation onNext={next} onBack={back} />}
              {stepIndex === 3 && <StepBoostTrust onNext={next} onBack={back} />}
              {stepIndex === 4 && <StepFinish />}
            </CardContent>
          </Card>

          <BackToHomeCTA />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
