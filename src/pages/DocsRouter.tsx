import { useEffect, Suspense } from "react";
import { useLanguage } from '@/i18n/LanguageContext';
import { useLocation, Navigate } from "react-router-dom";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { BackToHomeBar, BackToHomeCTA } from "@/components/layout/BackToHome";
import { lazyWithChunkRecovery } from "@/lib/appUpdateRecovery";

const EcosystemDocs = lazyWithChunkRecovery(() => import("@/pages/EcosystemDocs"), "EcosystemDocs");
const PlatformDocs = lazyWithChunkRecovery(() => import("@/pages/PlatformDocs"), "PlatformDocs");
const IntegrationDocs = lazyWithChunkRecovery(() => import("@/pages/IntegrationDocs"), "IntegrationDocs");
const SdkRepositoryDocs = lazyWithChunkRecovery(() => import("@/pages/SdkRepositoryDocs"), "SdkRepositoryDocs");
const MasterCharterDocs = lazyWithChunkRecovery(() => import("@/pages/MasterCharterDocs"), "MasterCharterDocs");
const PplpDocs = lazyWithChunkRecovery(() => import("@/pages/PplpDocs"), "PplpDocs");
const ArchitectureDocs = lazyWithChunkRecovery(() => import("@/pages/ArchitectureDocs"), "ArchitectureDocs");
const DocsChangelog = lazyWithChunkRecovery(() => import("@/pages/DocsChangelog"), "DocsChangelog");
const LightScoreParamsDocs = lazyWithChunkRecovery(() => import("@/pages/docs/LightScoreParams"), "LightScoreParamsDocs");
const IdentityTrustLayerDocs = lazyWithChunkRecovery(() => import("@/pages/docs/IdentityTrustLayer"), "IdentityTrustLayerDocs");
const AntiWhaleCapDocs = lazyWithChunkRecovery(() => import("@/pages/docs/AntiWhaleCap"), "AntiWhaleCapDocs");
const TokenLimitsDocs = lazyWithChunkRecovery(() => import("@/pages/docs/TokenLimits"), "TokenLimitsDocs");
const CascadeFormulaDocs = lazyWithChunkRecovery(() => import("@/pages/docs/CascadeFormula"), "CascadeFormulaDocs");
const ConnectorSpecDocs = lazyWithChunkRecovery(() => import("@/pages/docs/ConnectorSpecPage"), "ConnectorSpecDocs");
const MysteryBoxDocs = lazyWithChunkRecovery(() => import("@/pages/docs/MysteryBoxSpec"), "MysteryBoxDocs");
const PetGameGuideDocs = lazyWithChunkRecovery(() => import("@/pages/docs/PetGameGuide"), "PetGameGuideDocs");

const setCanonical = (href: string) => {
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
};

const ensureMetaDescription = (content: string) => {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "description";
    document.head.appendChild(meta);
  }
  meta.content = content;
};

const DocsFallback = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

export default function DocsRouter() {
  const { t } = useLanguage();
  const location = useLocation();

  const subpath = location.pathname.replace(/^\/docs\/?/, "");
  const first = subpath.split("/").filter(Boolean)[0] ?? "";

  useEffect(() => {
    const origin = window.location.origin;

    if (first === "platform") {
      document.title = "FUN Ecosystem Platform Documentation";
      ensureMetaDescription(t("drPlatformDesc"));
      setCanonical(`${origin}/docs/platform`);
      return;
    }
    if (first === "ecosystem") {
      document.title = "FUN Ecosystem SSO Documentation";
      ensureMetaDescription(t("drSsoDesc"));
      setCanonical(`${origin}/docs/ecosystem`);
      return;
    }
    if (first === "integration") {
      document.title = "FUN Profile Integration Guide";
      ensureMetaDescription(t("drIntegrationDesc"));
      setCanonical(`${origin}/docs/integration`);
      return;
    }
    if (first === "sdk-repository") {
      document.title = "SDK Repository Setup | @fun-ecosystem/sso-sdk";
      ensureMetaDescription(t("drSdkDesc"));
      setCanonical(`${origin}/docs/sdk-repository`);
      return;
    }
    if (first === "master-charter") {
      document.title = t("drCharterTitle");
      ensureMetaDescription(t("drCharterDesc"));
      setCanonical(`${origin}/docs/master-charter`);
      return;
    }
    if (first === "pplp") {
      document.title = "Proof of Pure Love Protocol (PPLP) | FUN Ecosystem";
      ensureMetaDescription(t("drPplpDesc"));
      setCanonical(`${origin}/docs/pplp`);
      return;
    }
    if (first === "architecture") {
      document.title = "Core Architecture | FUN Ecosystem";
      ensureMetaDescription(t("drArchDesc"));
      setCanonical(`${origin}/docs/architecture`);
      return;
    }
    if (first === "changelog") {
      document.title = t("drChangelogTitle");
      ensureMetaDescription(t("drChangelogDesc"));
      setCanonical(`${origin}/docs/changelog`);
      return;
    }
    if (first === "anti-whale-cap") {
      document.title = "Anti-Whale Cap 3% | FUN Ecosystem Mint Policy";
      ensureMetaDescription(t("drAntiWhaleDesc"));
      setCanonical(`${origin}/docs/anti-whale-cap`);
      return;
    }
    if (first === "token-limits") {
      document.title = "Token Limits & Realtime Status | FUN Ecosystem";
      ensureMetaDescription(t("drTokenLimitsDesc"));
      setCanonical(`${origin}/docs/token-limits`);
      return;
    }
    if (first === "cascade-formula") {
      document.title = t("casDocTitle");
      ensureMetaDescription(t("drCascadeDesc"));
      setCanonical(`${origin}/docs/cascade-formula`);
      return;
    }
    if (first === "connector-spec") {
      document.title = "Connector — First On-chain Giver | FUN.Rich";
      ensureMetaDescription(t("drConnectorDesc"));
      setCanonical(`${origin}/docs/connector-spec`);
      return;
    }
    if (first === "mystery-box") {
      document.title = t("drMysteryTitle");
      ensureMetaDescription(t("drMysteryDesc"));
      setCanonical(`${origin}/docs/mystery-box`);
      return;
    }
    if (first === "pet-game-guide") {
      document.title = t("drPetTitle");
      ensureMetaDescription(t("drPetDesc"));
      setCanonical(`${origin}/docs/pet-game-guide`);
      return;
    }
    document.title = "FUN Ecosystem Documentation";
    ensureMetaDescription(t("drDocsDesc"));
    setCanonical(`${origin}/docs`);
  }, [first, t]);

  const page = (() => {
    if (first === "platform") return <PlatformDocs />;
    if (first === "ecosystem") return <EcosystemDocs />;
    if (first === "integration") return <IntegrationDocs />;
    if (first === "sdk-repository") return <SdkRepositoryDocs />;
    if (first === "master-charter") return <MasterCharterDocs />;
    if (first === "pplp") return <PplpDocs />;
    if (first === "architecture") return <ArchitectureDocs />;
    if (first === "changelog") return <DocsChangelog />;
    if (first === "light-score-params") return <LightScoreParamsDocs />;
    if (first === "identity-trust-layer") return <IdentityTrustLayerDocs />;
    if (first === "anti-whale-cap") return <AntiWhaleCapDocs />;
    if (first === "token-limits") return <TokenLimitsDocs />;
    if (first === "cascade-formula") return <CascadeFormulaDocs />;
    if (first === "connector-spec") return <ConnectorSpecDocs />;
    if (first === "mystery-box") return <MysteryBoxDocs />;
    if (first === "pet-game-guide") return <PetGameGuideDocs />;
    return <Navigate to="/docs/ecosystem" replace />;
  })();

  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="px-4 pt-4 pb-32 max-w-5xl mx-auto">
          <BackToHomeBar />
          <Suspense fallback={<DocsFallback />}>{page}</Suspense>
          <BackToHomeCTA />
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
