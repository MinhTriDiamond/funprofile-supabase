import { useState, useEffect, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Fingerprint, ShieldCheck, Award, Sparkles, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMyGuardians } from '@/hooks/useGuardians';
import { useDID } from '@/hooks/useDID';
import { useTrustProfile } from '@/hooks/useTrustProfile';
import { useUserSBTs } from '@/hooks/useUserSBTs';
import { useDIBProfile } from '@/hooks/useDIBProfile';
import { DIDBadge } from '@/components/identity/DIDBadge';
import { TrustTierBadge } from '@/components/identity/TrustTierBadge';
import { TrustEngineBreakdown } from '@/components/identity/TrustEngineBreakdown';
import { SBTGallery } from '@/components/identity/SBTGallery';
import { DIBVaultPanel } from '@/components/identity/DIBVaultPanel';
import { SybilRiskIndicator } from '@/components/identity/SybilRiskIndicator';
import { GuardianManager } from '@/components/identity/GuardianManager';
import { RecoveryWizard } from '@/components/identity/RecoveryWizard';
import { PendingRecoveryRequests } from '@/components/identity/PendingRecoveryRequests';
import { IncomingGuardianInvitations } from '@/components/identity/IncomingGuardianInvitations';
import { DisputeList } from '@/components/identity/DisputeList';
import { DIDLevelProgression } from '@/components/identity/DIDLevelProgression';
import { EntityRegistryHub } from '@/components/identity/EntityRegistryHub';
import { LinkedIdentitiesPanel } from '@/components/identity/LinkedIdentitiesPanel';
import { DIDResolverPanel } from '@/components/identity/DIDResolverPanel';
import { TrustGuidePanel } from '@/components/identity/TrustGuidePanel';
import { TrustJourneyTimeline } from '@/components/identity/TrustJourneyTimeline';
import { NextBestAction } from '@/components/identity/NextBestAction';
import { IdentityVerificationCard } from '@/components/identity/IdentityVerificationCard';
import { EcosystemTab } from '@/components/identity/federation/EcosystemTab';
import { FederationBadge } from '@/components/identity/federation/FederationBadge';
import { ImpersonationAlertsTab } from '@/components/identity/ImpersonationAlertsTab';
import { useImpersonationAlerts } from '@/hooks/useImpersonationAlerts';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

// Slug nested route ↔ tab key nội bộ (giữ Tabs values cũ để khỏi sửa nội dung)
const SLUG_TO_TAB: Record<string, string> = {
  trust: 'trust',
  alerts: 'alerts',
  sbts: 'sbt',
  dib: 'dib',
  ecosystem: 'ecosystem',
  entities: 'entity',
  recovery: 'recovery',
  disputes: 'disputes',
  linked: 'links',
};
const TAB_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_TO_TAB).map(([slug, tab]) => [tab, slug]),
);
// Legacy ?tab= values (kể cả slug mới) → slug chuẩn
const LEGACY_TAB_TO_SLUG: Record<string, string> = {
  trust: 'trust',
  alerts: 'alerts',
  sbt: 'sbts',
  sbts: 'sbts',
  dib: 'dib',
  ecosystem: 'ecosystem',
  entity: 'entities',
  entities: 'entities',
  recovery: 'recovery',
  disputes: 'disputes',
  links: 'linked',
  linked: 'linked',
};

const DEFAULT_SLUG = 'trust';

export default function IdentityDashboard() {
  const { userId } = useCurrentUser();
  const navigate = useNavigate();
  const params = useParams<{ tab?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [guideOpen, setGuideOpen] = useState(false);

  // ── Legacy ?tab= → nested redirect (replace, không tạo history)
  const legacyTab = searchParams.get('tab');
  useEffect(() => {
    if (!legacyTab) return;
    const slug = LEGACY_TAB_TO_SLUG[legacyTab] ?? DEFAULT_SLUG;
    // Bỏ ?tab khỏi URL, chuyển sang nested
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    const search = next.toString();
    navigate(`/identity/${slug}${search ? `?${search}` : ''}`, { replace: true });
  }, [legacyTab, navigate, searchParams]);

  // ── ?guide=1 mở guide panel
  useEffect(() => {
    if (searchParams.get('guide') === '1') {
      setGuideOpen(true);
      searchParams.delete('guide');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const slug = params.tab;
  const slugValid = !slug || slug in SLUG_TO_TAB;
  const activeTab = useMemo(
    () => (slug && slug in SLUG_TO_TAB ? SLUG_TO_TAB[slug] : SLUG_TO_TAB[DEFAULT_SLUG]),
    [slug],
  );

  const handleTabChange = (tabKey: string) => {
    const targetSlug = TAB_TO_SLUG[tabKey] ?? DEFAULT_SLUG;
    if (targetSlug === slug) return;
    // Push để browser Back có thể quay tab trước
    navigate(`/identity/${targetSlug}`);
  };

  const { data: did, isLoading: l1, refetch: r1 } = useDID();
  const { data: trust, isLoading: l2, refetch: r2 } = useTrustProfile();
  const { data: sbts = [], refetch: r3 } = useUserSBTs();
  const { data: dib, refetch: r4 } = useDIBProfile();
  const { data: guardians = [] } = useMyGuardians();
  const [recalc, setRecalc] = useState(false);
  const needsOnboarding = guardians.filter((g: any) => g.status !== 'revoked').length < 2;

  // ── /identity (không có :tab, không có legacy ?tab=) → redirect /identity/trust
  if (!legacyTab && !params.tab) {
    return <Navigate to={`/identity/${DEFAULT_SLUG}`} replace />;
  }
  // ── Slug không hợp lệ → redirect mặc định
  if (!slugValid) {
    return <Navigate to={`/identity/${DEFAULT_SLUG}`} replace />;
  }

  const handleRecalc = async () => {
    if (!did?.did_id) return;
    setRecalc(true);
    try {
      const { error } = await supabase.functions.invoke('identity-trust-engine', { body: { did_id: did.did_id } });
      if (error) throw error;
      toast.success('Đã tính lại Trust Score');
      await Promise.all([r1(), r2(), r3(), r4()]);
    } catch (e: any) {
      toast.error('Lỗi recalc', { description: e.message });
    } finally {
      setRecalc(false);
    }
  };

  if (!userId) {
    return (
      <div className="min-h-screen overflow-hidden">
        <FacebookNavbar />
        <main data-app-scroll className="app-main app-pb-nav">
          <div className="container py-12 text-center text-muted-foreground">Cần đăng nhập để xem Identity</div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }
  if (l1 || l2) {
    return (
      <div className="min-h-screen overflow-hidden">
        <FacebookNavbar />
        <main data-app-scroll className="app-main app-pb-nav">
          <div className="container py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="container max-w-6xl py-6 space-y-6">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-primary/5 via-background to-accent/5">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-6 h-6 text-primary" />
                    <h1 className="text-2xl font-bold">Identity & Trust</h1>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground break-all">{did?.did_id}</p>
                  <div className="flex flex-wrap gap-2">
                    <DIDBadge level={did?.did_level} status={did?.status} />
                    <TrustTierBadge tier={trust?.trust_tier} tc={Number(trust?.tc ?? 0)} />
                    <SybilRiskIndicator risk={trust?.sybil_risk} did_id={did?.did_id} showDispute />
                    <Badge variant="outline" className="gap-1"><Award className="w-3 h-3" />{sbts.length} SBT</Badge>
                    <FederationBadge userId={userId} />
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <Button onClick={() => setGuideOpen(true)} className="gap-2 bg-gradient-to-r from-emerald-500 to-amber-500 text-white hover:opacity-90 shadow-md">
                    <Sparkles className="w-4 h-4" /> Cách tăng Trust
                  </Button>
                  <Button onClick={handleRecalc} disabled={recalc} variant="outline" size="sm" className="gap-2">
                    {recalc ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Tính lại Trust
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <NextBestAction onOpenGuide={() => setGuideOpen(true)} />

          {needsOnboarding && (
            <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 shadow-md">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Hoàn tất Onboarding Trust</p>
                  <p className="text-xs text-muted-foreground">Mời guardian & gửi attestation đầu tiên trong 4 bước.</p>
                </div>
                <Button asChild size="sm" className="gap-1 shrink-0">
                  <Link to="/identity/onboarding">Bắt đầu <ArrowRight className="w-3.5 h-3.5" /></Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid grid-cols-3 sm:grid-cols-9 w-full h-auto">
              <TabsTrigger value="trust" className="text-xs">Trust</TabsTrigger>
              <TabsTrigger value="alerts" className="text-xs relative">
                Mạo danh
                <AlertsBadge />
              </TabsTrigger>
              <TabsTrigger value="sbt" className="text-xs">SBTs</TabsTrigger>
              <TabsTrigger value="dib" className="text-xs">DIB</TabsTrigger>
              <TabsTrigger value="ecosystem" className="text-xs">Ecosystem</TabsTrigger>
              <TabsTrigger value="entity" className="text-xs">Entities</TabsTrigger>
              <TabsTrigger value="recovery" className="text-xs">Recovery</TabsTrigger>
              <TabsTrigger value="disputes" className="text-xs">Khiếu nại</TabsTrigger>
              <TabsTrigger value="links" className="text-xs">Linked</TabsTrigger>
            </TabsList>
            <TabsContent value="trust" className="mt-4 space-y-4">
              <IdentityVerificationCard />
              <TrustJourneyTimeline currentTier={trust?.trust_tier} />
              <DIDLevelProgression />
              <TrustEngineBreakdown
                vs={Number(trust?.verification_strength ?? 0.2)}
                bs={Number(trust?.behavior_stability ?? 0.3)}
                ss={Number(trust?.social_trust ?? 0.2)}
                os={Number(trust?.onchain_credibility ?? 0.2)}
                hs={Number(trust?.historical_cleanliness ?? 0.5)}
                rf={Number(trust?.risk_factor ?? 1)}
                tc={Number(trust?.tc ?? 0.5)}
              />
            </TabsContent>
            <TabsContent value="alerts" className="mt-4">
              <ImpersonationAlertsTab />
            </TabsContent>
            <TabsContent value="sbt" className="mt-4">
              <SBTGallery sbts={sbts} />
            </TabsContent>
            <TabsContent value="dib" className="mt-4">
              <DIBVaultPanel dib={dib} />
              <p className="text-[11px] text-muted-foreground mt-3 text-center">
                DIB hash được snapshot daily lúc 03:30 UTC
              </p>
            </TabsContent>
            <TabsContent value="ecosystem" className="mt-4">
              <EcosystemTab />
            </TabsContent>
            <TabsContent value="entity" className="mt-4">
              <EntityRegistryHub />
            </TabsContent>
            <TabsContent value="recovery" className="mt-4 space-y-4">
              <IncomingGuardianInvitations />
              <div className="grid gap-4 lg:grid-cols-2">
                <GuardianManager />
                <RecoveryWizard />
              </div>
              <PendingRecoveryRequests />
            </TabsContent>
            <TabsContent value="disputes" className="mt-4">
              <DisputeList />
            </TabsContent>
            <TabsContent value="links" className="mt-4 space-y-4">
              <LinkedIdentitiesPanel />
              <DIDResolverPanel />
            </TabsContent>
          </Tabs>

          <TrustGuidePanel open={guideOpen} onOpenChange={setGuideOpen} />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

function AlertsBadge() {
  const { pending } = useImpersonationAlerts();
  if (!pending.length) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold">
      {pending.length}
    </span>
  );
}
