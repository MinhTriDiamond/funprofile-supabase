import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home } from 'lucide-react';
import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from '@/components/docs/DocSection';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';

const DocsChangelog = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-foreground">
                  {t('chgTitle')}
                </h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {t('chgSubtitle')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/docs/architecture">
                <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3">
                  <span className="text-xs sm:text-sm">🏗 Architecture</span>
                </Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8">
                <Home className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
        {/* Thống kê tổng */}
        <DocSection id="stats" title={t('chgStatsTitle')}>
          <DocTable
            headers={[t('chgColMetric'), t('chgColCount')]}
            rows={[
              [t('chgStat1'), '4 components'],
              [t('chgStat2'), t('chgStat2Val')],
              [t('chgStat3'), t('chgStat3Val')],
              [t('chgStat4'), t('chgStat4Val')],
              ['API Endpoints', t('chgStat5Val')],
              ['Reason Codes', '18 codes (10 positive + 8 adjustment)'],
              ['Unit Test Cases', t('chgStat7Val')],
              ['Level / Trend', t('chgStat8Val')],
              [t('chgStat9'), t('chgStat9Val')],
            ]}
          />
        </DocSection>

        {/* Bảng tổng hợp 6 tài liệu */}
        <DocSection id="documents" title={t('chgDocsTitle')}>
          <DocTable
            headers={['#', t('chgColDoc'), t('chgColLines'), 'Sections', t('chgColMainContent')]}
            rows={[
              ['1', 'LightScoreActivities', '~248', t('chgDoc1Sections'), t('chgDoc1Content')],
              ['2', 'PplpMintAndDbDocs', '~384', t('chgDoc2Sections'), t('chgDoc2Content')],
              ['3', 'ScoringApiAndVersioningDocs', '~455', t('chgDoc3Sections'), t('chgDoc3Content')],
              ['4', 'ScoringConfigAndExampleDocs', '~204', t('chgDoc4Sections'), t('chgDoc4Content')],
            ]}
          />
        </DocSection>

        {/* Chi tiết từng tài liệu */}
        <DocSection id="detail-1" title={t('chgDetail1Title')}>
          <DocParagraph>
            {t('chgD1Para')}
          </DocParagraph>
          <DocList items={[
            t('chgD1Item1'),
            t('chgD1Item2'),
            t('chgD1Item3'),
            t('chgD1Item4'),
            t('chgD1Item5'),
            t('chgD1Item6'),
            t('chgD1Item7'),
            t('chgD1Item8'),
            t('chgD1Item9'),
          ]} />
          <DocAlert type="info">
            <Link to="/docs/architecture#activities-personal" className="underline text-inherit">
              {t('chgSeeDetail')}
            </Link>
          </DocAlert>
        </DocSection>

        <DocSection id="detail-2" title={t('chgDetail2Title')}>
          <DocParagraph>
            {t('chgD2Para')}
          </DocParagraph>
          <DocSubSection title={t('chgD2MintTitle')}>
            <DocList items={[
              t('chgD2Mint1'),
              t('chgD2Mint2'),
              t('chgD2Mint3'),
            ]} />
          </DocSubSection>
          <DocSubSection title={t('chgD2PillarsTitle')}>
            <DocTable
              headers={[t('chgColPillar'), t('pdocColMeaning')]}
              rows={[
                [t('chgPillar1Name'), t('chgPillar1')],
                [t('chgPillar2Name'), t('chgPillar2')],
                [t('chgPillar3Name'), t('chgPillar3')],
                [t('chgPillar4Name'), t('chgPillar4')],
                [t('chgPillar5Name'), t('chgPillar5')],
              ]}
            />
          </DocSubSection>
          <DocSubSection title={t('chgD2DbTitle')}>
            <DocList items={[
              t('chgD2Db1'),
              t('chgD2Db2'),
              t('chgD2Db3'),
              t('chgD2Db4'),
              t('chgD2Db5'),
              t('chgD2Db6'),
              t('chgD2Db7'),
              t('chgD2Db8'),
              t('chgD2Db9'),
              t('chgD2Db10'),
            ]} />
          </DocSubSection>
          <DocAlert type="info">
            <Link to="/docs/architecture#pplp-mint-mechanism" className="underline text-inherit">
              {t('chgSeeDetail')}
            </Link>
          </DocAlert>
        </DocSection>

        <DocSection id="detail-3" title={t('chgDetail3Title')}>
          <DocParagraph>
            {t('chgD3Para')}
          </DocParagraph>
          <DocSubSection title="5 API Endpoints">
            <DocTable
              headers={['Endpoint', 'Method', t('pdocColFunc')]}
              rows={[
                ['POST /v1/events', 'POST', t('chgD3Api1')],
                ['POST /v1/pplp/rate', 'POST', 'Submit PPLP rating'],
                ['GET /v1/light/{uid}/summary', 'GET', t('chgD3Api3')],
                ['GET /v1/light/{uid}/private', 'GET', t('chgD3Api4')],
                ['GET /v1/mint/epoch/{date}', 'GET', t('chgD3Api5')],
              ]}
            />
          </DocSubSection>
          <DocSubSection title="Reason Codes">
            <DocParagraph>
              {t('chgD3ReasonPara')}
            </DocParagraph>
          </DocSubSection>
          <DocSubSection title={t('chgD3LevelsTitle')}>
            <DocTable
              headers={['Level', 'Light Score', t('chgColBenefits')]}
              rows={[
                ['🌱 Seed', '0–20', t('chgLvl1')],
                ['🌿 Sprout', '20–50', t('chgLvl2')],
                ['🌸 Bloom', '50–80', t('chgLvl3')],
                ['🛡 Guardian', '80–95', t('chgLvl4')],
                ['🏛 Architect', '95–100', 'Governance + Council'],
              ]}
            />
          </DocSubSection>
          <DocSubSection title={t('chgD3ProtectTitle')}>
            <DocList items={[
              t('chgD3Prot1'),
              t('chgD3Prot2'),
              t('chgD3Prot3'),
            ]} />
          </DocSubSection>
          <DocAlert type="info">
            <Link to="/docs/architecture#scoring-versioning" className="underline text-inherit">
              {t('chgSeeDetail')}
            </Link>
          </DocAlert>
        </DocSection>

        <DocSection id="detail-4" title={t('chgDetail4Title')}>
          <DocParagraph>
            {t('chgD4Para')}
          </DocParagraph>
          <DocSubSection title={t('chgD4ConfigTitle')}>
            <DocTable
              headers={[t('sceColGroup'), t('sceColParam'), t('idocColValue')]}
              rows={[
                ['weights', 'base_action / content', '0.4 / 0.6'],
                ['reputation', 'alpha, w_min, w_max', '0.25, 0.5, 2.0'],
                ['content', 'gamma, type_multiplier', '1.3, post=1.0 video=1.2 course=1.5'],
                ['consistency', 'beta, lambda', '0.6, 30'],
                ['sequence', 'eta, kappa', '0.5, 5'],
                ['penalty', 'theta, max_penalty', '0.8, 0.5'],
                ['mint', 'epoch, anti_whale, min_light', 'monthly, 3%, 10'],
              ]}
            />
          </DocSubSection>
          <DocSubSection title={t('chgD4ExampleTitle')}>
            <DocTable
              headers={[t('sceColStep'), t('sceColCalc'), t('sceColResult')]}
              rows={[
                ['1. Content Score', t('chgD4Calc1'), 'C = 2.33'],
                ['2. Base Action', 'Checkin + Mentor + Comment', 'B = 10'],
                ['3. Raw Score', '0.4×10 + 0.6×2.33', 'L_raw = 5.398'],
                ['4. Consistency', '1 + 0.6(1 - e^(-30/30))', 'M_cons = 1.379'],
                ['5. Sequence', '1 + 0.5×tanh(3/5)', 'M_seq = 1.268'],
                ['6. Penalty', '1 - min(0.5, 0.8×0.1)', '0.92'],
                ['7. Final Score', '5.398 × 1.379 × 1.268 × 0.92', '★ 8.67'],
                ['8. Mint', '100,000 × (8.67/10,000)', '86.7 FUN'],
              ]}
            />
          </DocSubSection>
          <DocSubSection title="4 Unit Test Cases">
            <DocTable
              headers={['Test', t('mbxColCondition'), t('sceLblExpected')]}
              rows={[
                ['Spam Burst', t('chgD4Test1Cond'), t('chgD4Test1Res')],
                ['Viral Drama', t('chgD4Test2Cond'), t('chgD4Test2Res')],
                ['Silent Contributor', t('chgD4Test3Cond'), t('chgD4Test3Res')],
                ['Rating Ring', t('chgD4Test4Cond'), t('chgD4Test4Res')],
              ]}
            />
          </DocSubSection>
          <DocAlert type="info">
            <Link to="/docs/architecture#scoring-config" className="underline text-inherit">
              {t('chgSeeDetail')}
            </Link>
          </DocAlert>
        </DocSection>

        {/* Đảm bảo hệ thống */}
        <DocSection id="guarantees" title={t('chgGuaranteesTitle')}>
          <DocList items={[
            t('chgG1'),
            t('chgG2'),
            t('chgG3'),
            t('chgG4'),
            t('chgG5'),
            t('chgG6'),
          ]} />
          <DocAlert type="success">
            {t('chgGAlert')}
          </DocAlert>
        </DocSection>
      </main>
    </div>
  );
};

export default DocsChangelog;
