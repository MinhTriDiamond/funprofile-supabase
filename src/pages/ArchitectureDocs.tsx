import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, Share2 } from 'lucide-react';
import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from '@/components/docs/DocSection';
import { TableOfContents } from '@/components/docs/TableOfContents';
import LightScoreActivities from '@/components/docs/LightScoreActivities';
import PplpMintAndDbDocs from '@/components/docs/PplpMintAndDbDocs';
import ScoringApiAndVersioningDocs from '@/components/docs/ScoringApiAndVersioningDocs';
import ScoringConfigAndExampleDocs from '@/components/docs/ScoringConfigAndExampleDocs';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';

const tocItems = [
  { id: 'overview', titleKey: 'adocTocTitle' },
  { id: 'layer-0', title: 'Layer 0 – Infrastructure' },
  { id: 'layer-1', title: 'Layer 1 – Identity (DIB Core)' },
  { id: 'layer-2', title: 'Layer 2 – Activity & Event Engine' },
  { id: 'layer-3', title: 'Layer 3 – Light Score Engine (PPLP)' },
  { id: 'layer-4', title: 'Layer 4 – Reward & Token Engine' },
  { id: 'layer-5', title: 'Layer 5 – Protection & Anti-Manipulation' },
  { id: 'layer-6', title: 'Layer 6 – Governance' },
  { id: 'layer-7', title: 'Layer 7 – Cross-Platform Integration' },
  { id: 'activities-personal', titleKey: 'adocTocActPersonal' },
  { id: 'activities-community', titleKey: 'adocTocActCommunity' },
  { id: 'activities-content', titleKey: 'adocTocActContent' },
  { id: 'activities-web3', titleKey: 'adocTocActWeb3' },
  { id: 'activities-ecosystem', titleKey: 'adocTocActEcosystem' },
  { id: 'behavior-sequences', titleKey: 'adocTocBehavior' },
  { id: 'light-tiers', titleKey: 'adocTocTiers' },
  { id: 'anti-farm', titleKey: 'adocTocAntiFarm' },
  { id: 'score-formula', titleKey: 'adocTocFormula' },
  { id: 'pplp-mint-mechanism', titleKey: 'adocTocMintMechanism' },
  { id: 'pplp-ego-protection', titleKey: 'adocTocEgoProtection' },
  { id: 'pplp-mantras', titleKey: 'adocTocMantras' },
  { id: 'db-logic-design', titleKey: 'adocTocDbLogic' },
  { id: 'db-pipeline', titleKey: 'adocTocDbPipeline' },
  { id: 'ai-scoring-arch', titleKey: 'adocTocAiScoring' },
  { id: 'scoring-versioning', title: 'Scoring Rule Versioning' },
  { id: 'api-endpoints', title: 'API Endpoints' },
  { id: 'reason-codes', title: 'Reason Codes Microcopy' },
  { id: 'level-system', title: 'Level System' },
  { id: 'mint-engine', titleKey: 'adocTocMintEngine' },
  { id: 'transparency-dashboard', title: 'Transparency Dashboard' },
  { id: 'long-term-protection', titleKey: 'adocTocLongTerm' },
  { id: 'scoring-config', title: 'Scoring Config V1' },
  { id: 'e2e-example', titleKey: 'adocTocE2eExample' },
  { id: 'unit-test-cases', title: 'Unit Test Cases' },
  { id: 'system-guarantees', titleKey: 'adocTocGuarantees' },
  { id: 'data-flow', title: 'Data Flow Summary' },
  { id: 'design-rules', title: 'Critical Design Rules' },
  { id: 'scalability', title: 'Scalability Plan' },
  { id: 'conclusion', titleKey: 'adocTocConclusion' },
];

const ArchitectureDocs = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState('overview');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-80px 0px -80% 0px' }
    );
    tocItems.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'FUN Ecosystem Core Architecture',
        text: t('adocShareText'),
        url: window.location.href,
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-foreground">
                  🏗 FUN Ecosystem Core Architecture
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Digital Identity Bank + Light Score PPLP — 7 Layers
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Link to="/docs/pplp">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <span className="text-xs sm:text-sm">📜 PPLP</span>
                </Button>
              </Link>
              <Link to="/docs/ecosystem">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <span className="text-xs sm:text-sm">🌐 SSO</span>
                </Button>
              </Link>
              <Link to="/docs/changelog">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <span className="text-xs sm:text-sm">{t('adocChangelogBtn')}</span>
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleShare} className="h-8 px-2 sm:px-3">
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8">
                <Home className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="flex gap-4 lg:gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <TableOfContents items={tocItems.map((i) => ({ ...i, title: i.titleKey ? t(i.titleKey as any) : (i as any).title }))} activeId={activeId} />
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Overview */}
            <DocSection id="overview" title={t('adocOverviewTitle')}>
              <DocParagraph>{t('adocOverviewPara')}</DocParagraph>
              <DocList items={[
                t('adocOverviewPrin1'),
                t('adocOverviewPrin2'),
                t('adocOverviewPrin3'),
                t('adocOverviewPrin4'),
                t('adocOverviewPrin5'),
              ]} />
              <DocAlert type="info">{t('adocOverviewAlert')}</DocAlert>

              {/* ASCII Diagram */}
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-6 text-foreground font-mono leading-relaxed">
{`            ┌──────────────────────────┐
            │      User + Wallet       │
            └────────────┬─────────────┘
                         ↓
            ┌──────────────────────────┐
            │   Digital Identity Bank  │
            └────────────┬─────────────┘
                         ↓
            ┌──────────────────────────┐
            │     Event Engine         │
            └────────────┬─────────────┘
                         ↓
            ┌──────────────────────────┐
            │    Light Score Engine    │
            └────────────┬─────────────┘
                         ↓
            ┌──────────────────────────┐
            │ Reward & Governance      │
            └──────────────────────────┘`}
              </pre>
            </DocSection>

            {/* Layer 0 */}
            <DocSection id="layer-0" title="🌐 Layer 0 – Infrastructure Layer">
              <DocParagraph>{t('adocL0Para')}</DocParagraph>
              <DocTable
                headers={[t('adocColComponent'), t('pdocColDesc')]}
                rows={[
                  ['Cloud (AWS/GCP)', t('adocL0R1')],
                  ['Containerized (K8s)', t('adocL0R2')],
                  ['CDN', t('adocL0R3')],
                  ['Load Balancer', t('adocL0R4')],
                  ['API Gateway', t('adocL0R5')],
                  ['Monitoring', t('adocL0R6')],
                ]}
              />
              <DocSubSection title={t('adocGoalsTitle')}>
                <DocList items={[
                  t('adocL0Goal1'),
                  t('adocL0Goal2'),
                  t('adocL0Goal3'),
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 1 */}
            <DocSection id="layer-1" title="🧬 Layer 1 – Identity Layer (Digital Identity Bank Core)">
              <DocParagraph>{t('adocL1Para')}</DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`User
  ↓
Wallet (Metamask / FUN Wallet)
  ↓
DID Service
  ↓
Soulbound Identity NFT
  ↓
Identity Metadata Store`}
              </pre>

              <DocSubSection title="1️⃣ Wallet Binding">
                <DocList items={[
                  t('adocL1Wallet1'),
                  t('adocL1Wallet2'),
                  t('adocL1Wallet3'),
                ]} />
              </DocSubSection>

              <DocSubSection title="2️⃣ DID Engine">
                <DocList items={[
                  'Generates unique Decentralized ID',
                  t('adocL1Did2'),
                ]} />
              </DocSubSection>

              <DocSubSection title="3️⃣ Soulbound NFT">
                <DocParagraph>{t('adocL1SoulPara')}</DocParagraph>
                <DocList items={[
                  t('adocL1Soul1'),
                  t('adocL1Soul2'),
                  t('adocL1Soul3'),
                ]} />
              </DocSubSection>

              <DocSubSection title="4️⃣ Identity Metadata Store">
                <DocList items={[
                  t('adocL1Meta1'),
                  t('adocL1Meta2'),
                  t('adocL1Meta3'),
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 2 */}
            <DocSection id="layer-2" title="⚙️ Layer 2 – Activity & Event Engine">
              <DocParagraph>{t('adocL2Para')}</DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Platform Events
      ↓
Event Validator
      ↓
Event Normalizer
      ↓
Event Ledger`}
              </pre>

              <DocSubSection title="Event Types">
                <DocList items={[
                  t('adocL2Ev1'),
                  t('adocL2Ev2'),
                  t('adocL2Ev3'),
                  t('adocL2Ev4'),
                  t('adocL2Ev5'),
                  t('adocL2Ev6'),
                  t('adocL2Ev7'),
                ]} />
              </DocSubSection>

              <DocSubSection title={t('adocL2VerifyTitle')}>
                <DocAlert type="warning">{t('adocL2VerifyAlert')}</DocAlert>
              </DocSubSection>
            </DocSection>

            {/* Layer 3 */}
            <DocSection id="layer-3" title="💡 Layer 3 – Light Score Engine (PPLP Core)">
              <DocParagraph>{t('adocL3Para')}</DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Event Ledger
      ↓
Scoring Algorithm
      ↓
Contribution Weighting
      ↓
Score Snapshot Generator
      ↓
On-chain Hash Anchor`}
              </pre>

              <DocSubSection title="Light Score Formula (Conceptual)">
                <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
                  <p className="font-mono text-sm sm:text-base text-foreground font-semibold">
                    Light Score = Σ (Verified Contribution × Weight × Time Decay Factor × Trust Multiplier)
                  </p>
                </div>
              </DocSubSection>

              <DocSubSection title="1️⃣ Weight Engine">
                <DocList items={[
                  t('adocL3Weight1'),
                  t('adocL3Weight2'),
                  t('adocL3Weight3'),
                ]} />
              </DocSubSection>

              <DocSubSection title="2️⃣ Trust Multiplier">
                <DocParagraph>{t('adocL3TrustIntro')}</DocParagraph>
                <DocList items={[
                  t('adocL3Trust1'),
                  t('adocL3Trust2'),
                  t('adocL3Trust3'),
                ]} />
              </DocSubSection>

              <DocSubSection title="3️⃣ Time Decay">
                <DocList items={[
                  t('adocL3Decay1'),
                  t('adocL3Decay2'),
                ]} />
              </DocSubSection>

              <DocSubSection title="4️⃣ Score Snapshot">
                <DocList items={[
                  t('adocL3Snap1'),
                  t('adocL3Snap2'),
                  t('adocL3Snap3'),
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 4 */}
            <DocSection id="layer-4" title="💰 Layer 4 – Reward & Token Engine">
              <DocParagraph>{t('adocL4Para')}</DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Light Score Snapshot
        ↓
Reward Allocator
        ↓
FUN Money Mint Logic
        ↓
Distribution Smart Contract`}
              </pre>

              <DocSubSection title="Reward Logic">
                <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
                  <p className="font-mono text-sm sm:text-base text-foreground font-semibold">
                    User Reward = (User Light Score / Total Ecosystem Light Score) × Reward Pool
                  </p>
                </div>
                <DocAlert type="info">{t('adocL4Alert')}</DocAlert>
              </DocSubSection>
            </DocSection>

            {/* Layer 5 */}
            <DocSection id="layer-5" title="🛡 Layer 5 – Protection & Anti-Manipulation">
              <DocParagraph>{t('adocL5Para')}</DocParagraph>
              <DocTable
                headers={['Module', t('pdocColFunc')]}
                rows={[
                  ['Sybil Detection', t('adocL5R1')],
                  ['AI Behavior Analysis', t('adocL5R2')],
                  ['Anomaly Detection', t('adocL5R3')],
                  ['Velocity Check', t('adocL5R4')],
                  ['Wallet Graph Analysis', t('adocL5R5')],
                ]}
              />

              <DocSubSection title="Anti-Abuse Framework">
                <DocList ordered items={[
                  t('adocL5Anti1'),
                  t('adocL5Anti2'),
                  t('adocL5Anti3'),
                  t('adocL5Anti4'),
                  t('adocL5Anti5'),
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 6 */}
            <DocSection id="layer-6" title="🏛 Layer 6 – Governance Layer">
              <DocParagraph>{t('adocL6Para')}</DocParagraph>
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{`Light Score
      ↓
Governance Weight
      ↓
Proposal Engine
      ↓
Voting Smart Contract`}
              </pre>

              <DocSubSection title={t('adocL6RightsTitle')}>
                <DocList items={[
                  t('adocL6Right1'),
                  t('adocL6Right2'),
                  t('adocL6Right3'),
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Layer 7 */}
            <DocSection id="layer-7" title="🌎 Layer 7 – Cross-Platform Integration">
              <DocParagraph>{t('adocL7Para')}</DocParagraph>
              <DocTable
                headers={['API', t('pdocColFunc')]}
                rows={[
                  ['DIB API', t('adocL7R1')],
                  ['Event API', t('adocL7R2')],
                  ['Light Score API', t('adocL7R3')],
                  ['Reward API', t('adocL7R4')],
                ]}
              />
              <DocSubSection title={t('adocL7PlatformsTitle')}>
                <DocList items={[
                  t('adocL7P1'),
                  t('adocL7P2'),
                  t('adocL7P3'),
                  t('adocL7P4'),
                  t('adocL7P5'),
                  t('adocL7P6'),
                  t('adocL7P7'),
                ]} />
              </DocSubSection>
            </DocSection>

            {/* Light Score Activities & Behavior Sequences */}
            <LightScoreActivities />

            {/* PPLP Mint, DB Logic & AI Scoring Architecture */}
            <PplpMintAndDbDocs />

            {/* Scoring Versioning, API Endpoints & Reason Codes */}
            <ScoringApiAndVersioningDocs />

            {/* Scoring Config V1, E2E Example & Unit Test Cases */}
            <ScoringConfigAndExampleDocs />

            {/* Data Flow */}
            <DocSection id="data-flow" title="🔁 Data Flow Summary">
              <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono leading-relaxed">
{`User Action
      ↓
Event Engine (validate + normalize)
      ↓
Light Score Engine (score + weight)
      ↓
Snapshot (hash on-chain)
      ↓
Reward Engine (proportional allocation)
      ↓
Token Distribution (smart contract)

★ Identity anchors everything.`}
              </pre>
            </DocSection>

            {/* Design Rules */}
            <DocSection id="design-rules" title="🔐 Critical Design Rules">
              <DocAlert type="warning">{t('adocRulesAlert')}</DocAlert>
              <DocList ordered items={[
                t('adocRule1'),
                t('adocRule2'),
                t('adocRule3'),
                t('adocRule4'),
                t('adocRule5'),
              ]} />
            </DocSection>

            {/* Scalability */}
            <DocSection id="scalability" title="🚀 Scalability Plan">
              <DocTable
                headers={['Phase', t('pdocColDesc'), t('adocColDetail')]}
                rows={[
                  ['Phase 1', 'Centralized', t('adocScaleR1')],
                  ['Phase 2', 'Hybrid', t('adocScaleR2')],
                  ['Phase 3', 'Full Modular', t('adocScaleR3')],
                ]}
              />
              <DocAlert type="success">{t('adocScaleAlert')}</DocAlert>
            </DocSection>

            {/* Conclusion */}
            <DocSection id="conclusion" title={t('adocConclusionTitle')}>
              <DocList items={[
                t('adocConclusion1'),
                t('adocConclusion2'),
                t('adocConclusion3'),
                t('adocConclusion4'),
              ]} />
              <DocAlert type="info">{t('adocConclusionAlert')}</DocAlert>
            </DocSection>
          </main>
        </div>
      </div>
    </div>
  );
};

export default ArchitectureDocs;
