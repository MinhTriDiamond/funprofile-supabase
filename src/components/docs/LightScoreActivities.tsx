import { DocSection, DocSubSection, DocParagraph, DocList, DocAlert, DocTable } from '@/components/docs/DocSection';
import { useLanguage } from '@/i18n/LanguageContext';

const LightScoreActivities = () => {
  const { t } = useLanguage();
  return (
    <>
      {/* I. Hoạt Động Cá Nhân */}
      <DocSection id="activities-personal" title={t('lsaS1Title')}>
        <DocSubSection title="1. Daily Presence">
          <DocList items={[
            t('lsaS1Daily1'),
            t('lsaS1Daily2'),
            t('lsaS1Daily3'),
          ]} />
        </DocSubSection>
        <DocSubSection title={t('lsaS1Sub2')}>
          <DocList items={[
            t('lsaS1Prof1'),
            t('lsaS1Prof2'),
            t('lsaS1Prof3'),
          ]} />
        </DocSubSection>
        <DocSubSection title={t('lsaS1Sub3')}>
          <DocList items={[
            t('lsaS1Pplp1'),
            t('lsaS1Pplp2'),
            t('lsaS1Pplp3'),
          ]} />
        </DocSubSection>
      </DocSection>

      {/* II. Hoạt Động Tương Tác Cộng Đồng */}
      <DocSection id="activities-community" title={t('lsaS2Title')}>
        <DocSubSection title="1. Light Interaction">
          <DocList items={[
            t('lsaS2Int1'),
            t('lsaS2Int2'),
            t('lsaS2Int3'),
            t('lsaS2Int4'),
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Mentorship / Support">
          <DocList items={[
            t('lsaS2Men1'),
            t('lsaS2Men2'),
            t('lsaS2Men3'),
          ]} />
        </DocSubSection>
        <DocSubSection title="3. Conflict Transformation">
          <DocList items={[
            t('lsaS2Con1'),
            t('lsaS2Con2'),
            t('lsaS2Con3'),
          ]} />
        </DocSubSection>
      </DocSection>

      {/* III. Hoạt Động Tạo Giá Trị Nội Dung */}
      <DocSection id="activities-content" title={t('lsaS3Title')}>
        <DocSubSection title="1. Content Creation">
          <DocList items={[
            t('lsaS3Cre1'),
            t('lsaS3Cre2'),
            t('lsaS3Cre3'),
            t('lsaS3Cre4'),
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Content Quality Signals">
          <DocList items={[
            t('lsaS3Qual1'),
            t('lsaS3Qual2'),
            t('lsaS3Qual3'),
          ]} />
        </DocSubSection>
        <DocSubSection title="3. Knowledge Contribution">
          <DocList items={[
            t('lsaS3Know1'),
            t('lsaS3Know2'),
            t('lsaS3Know3'),
          ]} />
        </DocSubSection>
      </DocSection>

      {/* IV. Hoạt Động Kinh Tế – Web3 */}
      <DocSection id="activities-web3" title={t('lsaS4Title')}>
        <DocSubSection title="1. On-chain Actions">
          <DocList items={[
            t('lsaS4On1'),
            t('lsaS4On2'),
            'Staking FUN / Camly Coin',
            t('lsaS4On4'),
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Earn & Give">
          <DocList items={[
            t('lsaS4Earn1'),
            t('lsaS4Earn2'),
            t('lsaS4Earn3'),
          ]} />
        </DocSubSection>
        <DocSubSection title="3. Value Flow Integrity">
          <DocAlert type="warning">
            {t('lsaS4Alert')}
          </DocAlert>
        </DocSubSection>
      </DocSection>

      {/* V. Đóng Góp Hệ Sinh Thái FUN */}
      <DocSection id="activities-ecosystem" title={t('lsaS5Title')}>
        <DocSubSection title="1. Cross-Platform Contribution">
          <DocList items={[
            t('lsaS5Cross1'),
            t('lsaS5Cross2'),
            t('lsaS5Cross3'),
            t('lsaS5Cross4'),
          ]} />
        </DocSubSection>
        <DocSubSection title="2. Builder Actions">
          <DocList items={[
            t('lsaS5Build1'),
            t('lsaS5Build2'),
            t('lsaS5Build3'),
            t('lsaS5Build4'),
          ]} />
        </DocSubSection>
      </DocSection>

      {/* VI. Chuỗi Hành Động */}
      <DocSection id="behavior-sequences" title={t('lsaS6Title')}>
        <DocAlert type="info">
          {t('lsaS6Alert')}
        </DocAlert>

        <DocSubSection title="1. Light Growth Chain">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{t('lsaChain1')}
          </pre>
          <DocParagraph>{t('lsaChain1Para')}</DocParagraph>
        </DocSubSection>

        <DocSubSection title="2. Mentorship Chain">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{t('lsaChain2')}
          </pre>
          <DocParagraph>{t('lsaChain2Para')}</DocParagraph>
        </DocSubSection>

        <DocSubSection title="3. Value Creation Loop">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{t('lsaChain3')}
          </pre>
          <DocParagraph>{t('lsaChain3Para')}</DocParagraph>
        </DocSubSection>

        <DocSubSection title="4. Conflict → Harmony Sequence">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{t('lsaChain4')}
          </pre>
          <DocParagraph>{t('lsaChain4Para')}</DocParagraph>
        </DocSubSection>

        <DocSubSection title="5. Economic Integrity Sequence">
          <pre className="bg-muted rounded-lg p-4 text-xs sm:text-sm overflow-x-auto my-4 text-foreground font-mono">
{t('lsaChain5')}
          </pre>
          <DocParagraph>{t('lsaChain5Para')}</DocParagraph>
        </DocSubSection>
      </DocSection>

      {/* VII. Phân Loại Cấp Độ */}
      <DocSection id="light-tiers" title={t('lsaS7Title')}>
        <DocTable
          headers={[t('lsaColTier'), t('lsaColTierName'), t('pdocColDesc')]}
          rows={[
            ['Tier 1', 'Light Presence', t('lsaTier1')],
            ['Tier 2', 'Light Contributor', t('lsaTier2')],
            ['Tier 3', 'Light Builder', t('lsaTier3')],
            ['Tier 4', 'Light Guardian', t('lsaTier4')],
            ['Tier 5', 'Light Architect', t('lsaTier5')],
          ]}
        />
      </DocSection>

      {/* VIII. Cơ Chế Chống Farm */}
      <DocSection id="anti-farm" title={t('lsaS8Title')}>
        <DocParagraph>
          {t('lsaS8Para')}
        </DocParagraph>
        <DocList ordered items={[
          t('lsaS8Item1'),
          t('lsaS8Item2'),
          t('lsaS8Item3'),
          t('lsaS8Item4'),
          t('lsaS8Item5'),
        ]} />
      </DocSection>

      {/* IX. Công Thức Cơ Bản */}
      <DocSection id="score-formula" title={t('lsaS9Title')}>
        <div className="bg-muted rounded-lg p-4 my-4 border-l-4 border-primary">
          <p className="font-mono text-sm sm:text-base text-foreground font-semibold leading-relaxed">
            Light Score = (Positive Actions × Quality Weight) × (Sequence Multiplier) × (Community Validation Weight) − (Integrity Penalty)
          </p>
        </div>

        <DocSubSection title={t('lsaExplainTitle')}>
          <DocList items={[
            t('lsaS9Exp1'),
            t('lsaS9Exp2'),
            t('lsaS9Exp3'),
            t('lsaS9Exp4'),
            t('lsaS9Exp5'),
          ]} />
        </DocSubSection>

        <DocSubSection title={t('lsaChecklistTitle')}>
          <DocList items={[
            t('lsaS9Check1'),
            t('lsaS9Check2'),
            t('lsaS9Check3'),
            t('lsaS9Check4'),
            t('lsaS9Check5'),
            t('lsaS9Check6'),
          ]} />
        </DocSubSection>
      </DocSection>
    </>
  );
};

export default LightScoreActivities;
